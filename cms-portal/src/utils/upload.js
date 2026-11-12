'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const sharp = require('sharp');
const config = require('../config/env');

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.vbs', '.js', '.mjs', '.cjs',
  '.php', '.py', '.rb', '.pl', '.html', '.htm', '.svg', '.dll', '.com', '.scr'
]);

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB ceiling
    files: 20
  }
});

function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // WebP: RIFF .... WEBP
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function detectPdfType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 5) return null;
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

function detectAudioType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  const ascii4 = buf.subarray(0, 4).toString('ascii');
  // ID3 MP3 or MPEG frame sync FF Ex / FF Fx
  if (buf.subarray(0, 3).toString('ascii') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    return { mime: 'audio/mpeg', ext: '.mp3' };
  }
  if (ascii4 === 'OggS') return { mime: 'audio/ogg', ext: '.ogg' };
  if (ascii4 === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE') return { mime: 'audio/wav', ext: '.wav' };
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') return { mime: 'audio/mp4', ext: '.m4a' };
  return null;
}

function assertSafeFilename(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(`Rejected dangerous file extension: ${ext}`);
  }
}

async function saveOptimizedGalleryImage(file, maxSizeBytes = 10 * 1024 * 1024, uploadRoot = config.uploadDir) {
  if (!file || !file.buffer) throw new Error('No image buffer provided.');
  assertSafeFilename(file.originalname);
  if (file.buffer.length > maxSizeBytes) {
    throw new Error(`Image "${file.originalname}" exceeds 10 MB maximum limit.`);
  }
  const realMime = detectImageType(file.buffer);
  if (!realMime) {
    throw new Error(`File "${file.originalname}" is not a valid JPG, PNG, or WebP image (magic-byte check failed).`);
  }

  const uuid = crypto.randomUUID();
  const fullRel = `gallery/${uuid}.webp`;
  const thumbRel = `gallery-thumbs/${uuid}-thumb.webp`;
  const fullAbs = path.join(uploadRoot, fullRel);
  const thumbAbs = path.join(uploadRoot, thumbRel);
  fs.mkdirSync(path.dirname(fullAbs), { recursive: true });
  fs.mkdirSync(path.dirname(thumbAbs), { recursive: true });

  // Optimize master image (auto-orient from EXIF, resize max 1920px wide without upscaling, convert to WebP)
  const masterInfo = await sharp(file.buffer, { failOn: 'truncated' })
    .rotate()
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84 })
    .toFile(fullAbs);

  // Generate thumbnail preserving original aspect ratio cleanly (no forced cropping)
  await sharp(file.buffer, { failOn: 'truncated' })
    .rotate()
    .resize({ width: 520, height: 520, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(thumbAbs);

  return {
    imagePath: `/cms-uploads/${fullRel}`,
    thumbnailPath: `/cms-uploads/${thumbRel}`,
    width: masterInfo.width,
    height: masterInfo.height,
    fileSize: masterInfo.size,
    originalFilename: path.basename(file.originalname)
  };
}

async function saveDirectorPhoto(file, maxSizeBytes = 5 * 1024 * 1024, uploadRoot = config.uploadDir) {
  if (!file || !file.buffer) throw new Error('No photo buffer provided.');
  assertSafeFilename(file.originalname);
  if (file.buffer.length > maxSizeBytes) {
    throw new Error(`Photo "${file.originalname}" exceeds 5 MB maximum limit.`);
  }
  const realMime = detectImageType(file.buffer);
  if (!realMime) {
    throw new Error(`File "${file.originalname}" is not a valid JPG, PNG, or WebP image (magic-byte check failed).`);
  }

  const uuid = crypto.randomUUID();
  const rel = `directors/${uuid}.webp`;
  const abs = path.join(uploadRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const info = await sharp(file.buffer, { failOn: 'truncated' })
    .rotate()
    .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(abs);

  return {
    photoPath: `/cms-uploads/${rel}`,
    width: info.width,
    height: info.height,
    fileSize: info.size,
    originalFilename: path.basename(file.originalname)
  };
}

function savePdfFile(file, subFolder = 'documents', uploadRoot = config.uploadDir) {
  if (!file || !file.buffer) throw new Error('No PDF buffer provided.');
  assertSafeFilename(file.originalname);
  if (file.buffer.length > 15 * 1024 * 1024) {
    throw new Error('PDF exceeds 15 MB maximum limit.');
  }
  if (!detectPdfType(file.buffer)) {
    throw new Error(`File "${file.originalname}" is not a valid PDF document (missing %PDF- signature).`);
  }
  const safeSub = ['documents', 'notices'].includes(subFolder) ? subFolder : 'documents';
  const uuid = crypto.randomUUID();
  const rel = `${safeSub}/${uuid}.pdf`;
  const abs = path.join(uploadRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, file.buffer);
  return {
    filePath: `/cms-uploads/${rel}`,
    fileSize: file.buffer.length,
    originalFilename: path.basename(file.originalname)
  };
}

function saveAudioFile(file, uploadRoot = config.uploadDir) {
  if (!file || !file.buffer) throw new Error('No audio buffer provided.');
  assertSafeFilename(file.originalname);
  if (file.buffer.length > 15 * 1024 * 1024) {
    throw new Error('Audio narration file exceeds 15 MB maximum limit.');
  }
  const audioInfo = detectAudioType(file.buffer);
  if (!audioInfo) {
    throw new Error(`File "${file.originalname}" is not a supported MP3, OGG, WAV, or M4A audio file.`);
  }
  const uuid = crypto.randomUUID();
  const rel = `audio/${uuid}${audioInfo.ext}`;
  const abs = path.join(uploadRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, file.buffer);
  return {
    audioPath: `/cms-uploads/${rel}`,
    fileSize: file.buffer.length,
    originalFilename: path.basename(file.originalname)
  };
}

function resolveUploadDiskPath(publicUploadUrl, uploadRoot = config.uploadDir) {
  if (!publicUploadUrl || !publicUploadUrl.startsWith('/cms-uploads/')) return null;
  const rel = publicUploadUrl.slice('/cms-uploads/'.length);
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return null;
  const candidate = path.resolve(uploadRoot, rel);
  const rootResolved = path.resolve(uploadRoot);
  if (!candidate.startsWith(rootResolved + path.sep)) return null;
  return candidate;
}

module.exports = {
  uploadMemory,
  detectImageType,
  detectPdfType,
  detectAudioType,
  saveOptimizedGalleryImage,
  saveDirectorPhoto,
  savePdfFile,
  saveAudioFile,
  resolveUploadDiskPath
};


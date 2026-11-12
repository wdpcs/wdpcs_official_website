'use strict';

const express = require('express');
const { sanitizePlainText } = require('../utils/sanitize');
const { recordAudit, recordRevision, getBoolSetting } = require('../utils/audit');

function createFinancialRouter({ getDb, requirePermission }) {
  const router = express.Router();

  // List Deposit & Loan Products + Recent History
  router.get('/products', requirePermission('financial:view', 'financial:edit'), (req, res) => {
    const db = getDb();
    const deposits = db.prepare(`
      SELECT d.*, u.full_name AS updated_by_name, a.full_name AS approved_by_name
      FROM deposit_products d
      LEFT JOIN admin_users u ON u.id = d.updated_by
      LEFT JOIN admin_users a ON a.id = d.approved_by
      ORDER BY d.display_order ASC, d.id ASC
    `).all().map(r => ({
      ...r,
      specs: JSON.parse(r.specs_json || '[]'),
      draft_payload: r.draft_payload ? JSON.parse(r.draft_payload) : null
    }));

    const loans = db.prepare(`
      SELECT l.*, u.full_name AS updated_by_name, a.full_name AS approved_by_name
      FROM loan_products l
      LEFT JOIN admin_users u ON u.id = l.updated_by
      LEFT JOIN admin_users a ON a.id = l.approved_by
      ORDER BY l.display_order ASC, l.id ASC
    `).all().map(r => ({
      ...r,
      draft_payload: r.draft_payload ? JSON.parse(r.draft_payload) : null
    }));

    return res.json({ ok: true, deposits, loans });
  });

  // Shared update handler for deposits & loans (keeps rate history intact!)
  function handleProductUpdate(productType, req, res) {
    const db = getDb();
    const id = Number(req.params.id);
    const table = productType === 'deposit' ? 'deposit_products' : 'loan_products';
    const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Product not found.' });

    const body = req.body || {};
    const action = sanitizePlainText(body.action || 'submit_approval', 32); // 'save_draft' | 'submit_approval' | 'publish'
    const changeReason = sanitizePlainText(body.changeReason || 'Administrative update', 300);

    const proposed = {
      product_name: sanitizePlainText(body.productName, 120) || existing.product_name,
      interest_rate: sanitizePlainText(body.interestRate, 100) || existing.interest_rate,
      rate_type: sanitizePlainText(body.rateType, 100) || existing.rate_type,
      effective_from: sanitizePlainText(body.effectiveFrom, 32) || existing.effective_from,
      effective_until: body.effectiveUntil ? sanitizePlainText(body.effectiveUntil, 32) : null,
      description: sanitizePlainText(body.description, 2000) || existing.description,
      status: ['Active', 'Inactive'].includes(body.status) ? body.status : existing.status,
      tenure: sanitizePlainText(body.tenure, 120) || existing.tenure,
      eligibility: sanitizePlainText(body.eligibility, 400) || existing.eligibility
    };

    if (productType === 'deposit') {
      proposed.min_amount = sanitizePlainText(body.minAmount, 160) || existing.min_amount;
      proposed.specs_json = Array.isArray(body.specs) ? JSON.stringify(body.specs) : existing.specs_json;
    } else {
      proposed.max_amount = sanitizePlainText(body.maxAmount, 160) || existing.max_amount;
      proposed.repayment_mode = sanitizePlainText(body.repaymentMode, 80) || existing.repayment_mode;
      proposed.required_documents = sanitizePlainText(body.requiredDocuments, 400) || existing.required_documents;
    }

    const rateChanged =
      proposed.interest_rate !== existing.interest_rate ||
      proposed.effective_from !== existing.effective_from ||
      proposed.effective_until !== existing.effective_until ||
      proposed.rate_type !== existing.rate_type;

    const requireApproval = getBoolSetting(db, 'require_approval_financial', true);
    const canPublish = req.permissions.has('financial:publish') || req.user.role_slug === 'super_admin';

    recordRevision(db, {
      entityType: table,
      entityId: String(id),
      versionLabel: existing.last_updated,
      snapshot: existing,
      changeNote: changeReason,
      user: req.user
    });

    // Save Draft ONLY (does NOT alter live published columns)
    if (action === 'save_draft') {
      db.prepare(`
        UPDATE ${table}
        SET draft_payload = ?, workflow_status = 'Draft', updated_by = ?, last_updated = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(proposed), req.user.id, id);

      recordAudit(db, {
        req, user: req.user, action: 'FINANCIAL_DRAFT_SAVED', module: 'Interest Rate Management',
        targetId: `${productType}:${id}`, targetLabel: existing.product_name, oldValue: { rate: existing.interest_rate }, newValue: { rate: proposed.interest_rate }
      });
      return res.json({ ok: true, workflowStatus: 'Draft' });
    }

    // Submit for approval OR direct publish depending on policy/role
    const shouldQueuePending = action === 'submit_approval' || (requireApproval && !canPublish) || (requireApproval && body.forceDirectPublish !== true);

    if (action === 'submit_approval' || (requireApproval && body.forceDirectPublish !== true)) {
      db.prepare(`
        UPDATE ${table}
        SET draft_payload = ?, workflow_status = 'Pending Approval', updated_by = ?
        WHERE id = ?
      `).run(JSON.stringify(proposed), req.user.id, id);

      // Append pending rate history entry (never overwrites existing history!)
      const histInfo = db.prepare(`
        INSERT INTO interest_rate_history
          (product_type, product_id, product_name, previous_rate, new_rate, rate_type, effective_from, effective_until, change_reason, approval_status, changed_by, changed_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
      `).run(
        productType, id, proposed.product_name, existing.interest_rate, proposed.interest_rate,
        proposed.rate_type, proposed.effective_from, proposed.effective_until, changeReason,
        req.user.id, req.user.full_name || req.user.username
      );

      recordAudit(db, {
        req, user: req.user, action: 'RATE_UPDATE_SUBMITTED', module: 'Interest Rate Management',
        targetId: `${productType}:${id}`, targetLabel: proposed.product_name,
        oldValue: { interestRate: existing.interest_rate, effectiveFrom: existing.effective_from },
        newValue: { interestRate: proposed.interest_rate, effectiveFrom: proposed.effective_from, pendingHistoryId: Number(histInfo.lastInsertRowid) }
      });
      return res.json({ ok: true, workflowStatus: 'Pending Approval', pendingHistoryId: Number(histInfo.lastInsertRowid) });
    }

    // Direct Approved Publish (requires financial:publish)
    if (!canPublish) {
      return res.status(403).json({ ok: false, error: 'Publishing permission required to apply live interest rate changes.' });
    }

    applyProductLiveUpdate(db, table, id, proposed, req.user.id);
    if (rateChanged || proposed.description !== existing.description) {
      db.prepare(`
        INSERT INTO interest_rate_history
          (product_type, product_id, product_name, previous_rate, new_rate, rate_type, effective_from, effective_until, change_reason, approval_status, changed_by, changed_by_name, approved_by, approved_by_name, approved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?, ?, ?, ?, datetime('now'))
      `).run(
        productType, id, proposed.product_name, existing.interest_rate, proposed.interest_rate,
        proposed.rate_type, proposed.effective_from, proposed.effective_until, changeReason,
        req.user.id, req.user.full_name || req.user.username,
        req.user.id, req.user.full_name || req.user.username
      );
    }

    recordAudit(db, {
      req, user: req.user, action: 'INTEREST_RATE_PUBLISHED', module: 'Interest Rate Management',
      targetId: `${productType}:${id}`, targetLabel: proposed.product_name,
      oldValue: { rate: existing.interest_rate, effectiveFrom: existing.effective_from },
      newValue: { rate: proposed.interest_rate, effectiveFrom: proposed.effective_from }
    });
    return res.json({ ok: true, workflowStatus: 'Published' });
  }

  function applyProductLiveUpdate(db, table, id, proposed, approverId) {
    if (table === 'deposit_products') {
      db.prepare(`
        UPDATE deposit_products
        SET product_name = ?, interest_rate = ?, rate_type = ?, effective_from = ?, effective_until = ?,
            min_amount = ?, tenure = ?, eligibility = ?, description = ?, specs_json = ?, status = ?,
            is_published = 1, workflow_status = 'Published', draft_payload = NULL, approved_by = ?, updated_by = COALESCE(updated_by, ?),
            last_updated = datetime('now')
        WHERE id = ?
      `).run(
        proposed.product_name, proposed.interest_rate, proposed.rate_type, proposed.effective_from, proposed.effective_until,
        proposed.min_amount, proposed.tenure, proposed.eligibility, proposed.description, proposed.specs_json, proposed.status,
        approverId, approverId, id
      );
    } else {
      db.prepare(`
        UPDATE loan_products
        SET product_name = ?, interest_rate = ?, rate_type = ?, effective_from = ?, effective_until = ?,
            max_amount = ?, tenure = ?, repayment_mode = ?, eligibility = ?, required_documents = ?, description = ?, status = ?,
            is_published = 1, workflow_status = 'Published', draft_payload = NULL, approved_by = ?, updated_by = COALESCE(updated_by, ?),
            last_updated = datetime('now')
        WHERE id = ?
      `).run(
        proposed.product_name, proposed.interest_rate, proposed.rate_type, proposed.effective_from, proposed.effective_until,
        proposed.max_amount, proposed.tenure, proposed.repayment_mode, proposed.eligibility, proposed.required_documents,
        proposed.description, proposed.status, approverId, approverId, id
      );
    }
  }

  router.put('/deposits/:id', requirePermission('financial:edit', 'financial:publish'), (req, res) => {
    return handleProductUpdate('deposit', req, res);
  });

  router.put('/loans/:id', requirePermission('financial:edit', 'financial:publish'), (req, res) => {
    return handleProductUpdate('loan', req, res);
  });

  // Interest Rate Historical Ledger
  router.get('/rate-history', requirePermission('financial:view', 'financial:edit'), (req, res) => {
    const db = getDb();
    const history = db.prepare(`SELECT * FROM interest_rate_history ORDER BY id DESC LIMIT 200`).all();
    return res.json({ ok: true, history });
  });

  // Approve Pending Rate Change
  router.post('/rate-history/:historyId/approve', requirePermission('financial:publish'), (req, res) => {
    const db = getDb();
    const histId = Number(req.params.historyId);
    const hist = db.prepare(`SELECT * FROM interest_rate_history WHERE id = ?`).get(histId);
    if (!hist) return res.status(404).json({ ok: false, error: 'Rate history entry not found.' });
    if (hist.approval_status !== 'Pending') {
      return res.status(400).json({ ok: false, error: `Entry is already ${hist.approval_status}.` });
    }

    const table = hist.product_type === 'deposit' ? 'deposit_products' : 'loan_products';
    const product = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(hist.product_id);
    if (!product) return res.status(404).json({ ok: false, error: 'Linked product not found.' });

    const draft = product.draft_payload ? JSON.parse(product.draft_payload) : {
      product_name: hist.product_name,
      interest_rate: hist.new_rate,
      rate_type: hist.rate_type,
      effective_from: hist.effective_from,
      effective_until: hist.effective_until,
      min_amount: product.min_amount,
      max_amount: product.max_amount,
      tenure: product.tenure,
      repayment_mode: product.repayment_mode,
      eligibility: product.eligibility,
      required_documents: product.required_documents,
      description: product.description,
      specs_json: product.specs_json,
      status: product.status
    };

    applyProductLiveUpdate(db, table, hist.product_id, draft, req.user.id);

    db.prepare(`
      UPDATE interest_rate_history
      SET approval_status = 'Approved', approved_by = ?, approved_by_name = ?, approved_at = datetime('now')
      WHERE id = ?
    `).run(req.user.id, req.user.full_name || req.user.username, histId);

    recordAudit(db, {
      req, user: req.user, action: 'INTEREST_RATE_APPROVED', module: 'Interest Rate Management',
      targetId: `${hist.product_type}:${hist.product_id}`, targetLabel: hist.product_name,
      oldValue: { previousRate: hist.previous_rate },
      newValue: { approvedRate: hist.new_rate, effectiveFrom: hist.effective_from }
    });
    return res.json({ ok: true });
  });

  router.post('/rate-history/:historyId/reject', requirePermission('financial:publish'), (req, res) => {
    const db = getDb();
    const histId = Number(req.params.historyId);
    const hist = db.prepare(`SELECT * FROM interest_rate_history WHERE id = ?`).get(histId);
    if (!hist) return res.status(404).json({ ok: false, error: 'Rate history entry not found.' });
    if (hist.approval_status !== 'Pending') {
      return res.status(400).json({ ok: false, error: `Entry is already ${hist.approval_status}.` });
    }
    const table = hist.product_type === 'deposit' ? 'deposit_products' : 'loan_products';
    db.prepare(`UPDATE ${table} SET draft_payload = NULL, workflow_status = CASE WHEN is_published = 1 THEN 'Published' ELSE 'Draft' END WHERE id = ?`).run(hist.product_id);
    db.prepare(`
      UPDATE interest_rate_history
      SET approval_status = 'Rejected', approved_by = ?, approved_by_name = ?, approved_at = datetime('now')
      WHERE id = ?
    `).run(req.user.id, req.user.full_name || req.user.username, histId);

    recordAudit(db, {
      req, user: req.user, action: 'INTEREST_RATE_REJECTED', module: 'Interest Rate Management',
      targetId: `${hist.product_type}:${hist.product_id}`, targetLabel: hist.product_name,
      oldValue: { proposedRate: hist.new_rate }
    });
    return res.json({ ok: true });
  });

  return router;
}

module.exports = { createFinancialRouter };

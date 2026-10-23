const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;

const REQUIRED_PAGES = [
  'index.html',
  'about.html',
  'services.html',
  'downloads.html',
  'gallery.html',
  'rooms-dormitories.html',
  'contact.html',
  'privacy-policy.html',
  'terms.html',
  'disclaimer.html',
  'accessibility.html',
  'notices.html',
  'faq.html',
  'search.html',
  '404.html'
];

const REQUIRED_CSS = [
  'css/main.css',
  'css/components.css',
  'css/responsive.css'
];

const REQUIRED_JS = [
  'js/main.js',
  'js/downloads.js',
  'js/gallery.js',
  'js/contact.js',
  'js/faq.js',
  'js/notices.js',
  'js/search.js'
];

const REQUIRED_ASSETS = [
  'assets/images/society-logo.svg',
  'assets/images/society-building.jpg',
  'assets/images/building-inauguration-2014-1.jpg',
  'assets/images/building-inauguration-2014-2.jpg',
  'assets/images/rebuild-kerala-house-handover-2018.jpg',
  'assets/images/care-home-second-house-handover-2018.jpg',
  'assets/images/favicon.svg',
  'assets/images/room-guest-room.svg',
  'assets/images/room-dormitory.svg',
  'assets/images/society-rooms-dormitory.jpg',
  'assets/images/society-guest-room.jpg',
  'assets/images/society-dormitory.jpg',
  'assets/images/gallery-1.svg',
  'assets/images/gallery-2.svg',
  'assets/images/gallery-3.svg',
  'assets/images/gallery-4.svg',
  'assets/images/gallery-5.svg',
  'assets/images/gallery-6.svg',
  'assets/downloads/emergency-loan-application.pdf',
  'assets/downloads/loan-voucher-promissory-note.pdf',
  'assets/downloads/consumer-goods-loan-application.pdf',
  'assets/downloads/deposit-loan-overdraft-application.pdf',
  'assets/downloads/festival-loan-application.pdf',
  'assets/downloads/medium-term-loan-application.pdf',
  'assets/downloads/savings-deposit-application.pdf',
  'assets/downloads/recurring-deposit-application.pdf',
  'assets/downloads/fixed-deposit-application.pdf',
  'assets/downloads/education-award-application.pdf',
  'assets/downloads/loan-statement-application.pdf',
  'assets/images/bank-sbi-logo.svg',
  'assets/images/bank-kerala-logo.svg',
  'assets/images/bank-kerala-logo.jpg',
  'assets/images/upi-logo.svg',
  'assets/images/bank-sbi-icon.svg',
  'assets/images/bank-kerala-icon.svg',
  'assets/images/upi-icon.svg',
  'sitemap.xml',
  'robots.txt',
  'site.webmanifest'
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${message}`);
  }
}

console.log('==================================================');
console.log('1. VERIFYING ALL 16 PAGES & SYSTEM ASSETS');
console.log('==================================================');

[...REQUIRED_PAGES, ...REQUIRED_CSS, ...REQUIRED_JS, ...REQUIRED_ASSETS].forEach(file => {
  const filePath = path.join(ROOT_DIR, file);
  assert(fs.existsSync(filePath), `File exists: ${file}`);
});

console.log('\n==================================================');
console.log('2. VERIFYING INTERNAL LINK INTEGRITY');
console.log('==================================================');

REQUIRED_PAGES.forEach(page => {
  const content = fs.readFileSync(path.join(ROOT_DIR, page), 'utf-8');
  
  // Find hrefs like "about.html" or "services.html#deposits" or "downloads.html?category=loan"
  const hrefMatches = content.match(/href="([^"#:]+)(\?[^"#]*)?(#[^"]*)?"/g) || [];
  
  hrefMatches.forEach(hrefAttr => {
    const rawHref = hrefAttr.replace(/^href="/, '').replace(/"$/, '');
    const cleanHref = rawHref.split('?')[0].split('#')[0];
    
    // Ignore external or empty or javascript
    if (!cleanHref || cleanHref.startsWith('http') || cleanHref.startsWith('mailto') || cleanHref.startsWith('tel') || cleanHref === '#') return;
    
    const targetPath = path.join(ROOT_DIR, cleanHref);
    assert(fs.existsSync(targetPath), `${page} -> valid link target: ${cleanHref}`);
  });
});

console.log('\n==================================================');
console.log('3. VERIFYING SERVICES SPECIFICATIONS (services.html)');
console.log('==================================================');

const servicesContent = fs.readFileSync(path.join(ROOT_DIR, 'services.html'), 'utf-8');

const expectedDeposits = [
  'Savings Deposit',
  'Recurring Deposit',
  'Fixed Deposit',
  'Monthly Savings Scheme',
  'Group Deposit Scheme'
];

const expectedLoans = [
  'Emergency Loan',
  'Hire Purchase Loan',
  'Medium Term Loan',
  'Festival Loan',
  'Deposit Loan'
];

expectedDeposits.forEach(dep => {
  assert(servicesContent.includes(dep), `services.html contains deposit scheme: "${dep}"`);
});

expectedLoans.forEach(loan => {
  assert(servicesContent.includes(loan), `services.html contains loan product: "${loan}"`);
});

// Loan Details Verification
assert(servicesContent.includes('100,000.00') || servicesContent.includes('1,00,000.00'), 'services.html has Emergency Loan max amount 100000.00');
assert(servicesContent.includes('200,000.00') || servicesContent.includes('2,00,000.00'), 'services.html has Hire Purchase Loan max amount 200000.00');
assert(servicesContent.includes('20,00,000.00') || servicesContent.includes('2000000.00'), 'services.html has Medium Term Loan max amount 2000000.00');
assert(servicesContent.includes('20,000.00'), 'services.html has Festival Loan max amount 20000.00');
assert(servicesContent.includes('Non-EMI'), 'services.html specifies Non-EMI repayment mode');
assert(servicesContent.includes('120 Months'), 'services.html specifies Medium Term Loan 120 Months tenure');

// Fixed Deposit Scheme Verification
assert(servicesContent.includes('Fixed Deposit'), 'services.html contains Fixed Deposit scheme');
assert(servicesContent.includes('500.00') || servicesContent.includes('500'), 'services.html specifies FD min deposit 500');
assert(servicesContent.includes('15 Days') || servicesContent.includes('15 days') || servicesContent.includes('15 ദിവസം'), 'services.html specifies FD min tenure 15 days');
assert(servicesContent.includes('25,000') || servicesContent.includes('25000'), 'services.html specifies FD periodic payout min deposit 25,000');
assert(servicesContent.includes('80% to 90%'), 'services.html specifies FD deposit loan 80% to 90%');

// Recurring Deposit Scheme Verification
assert(servicesContent.includes('Recurring Deposit'), 'services.html contains Recurring Deposit section');
assert(servicesContent.includes('100.00'), 'services.html specifies RD min monthly deposit ₹100.00');
assert(servicesContent.includes('12 Months to 120 Months'), 'services.html specifies RD tenure 12 Months to 120 Months');
assert(servicesContent.includes('75%') && servicesContent.includes('RD Rate + up to 2%'), 'services.html specifies RD deposit loan up to 75% at RD rate + 2%');
assert(servicesContent.includes('SB rate'), 'services.html specifies RD premature closure at SB rate');

// Savings Account Scheme Verification
assert(servicesContent.includes('Savings Deposit'), 'services.html contains Savings Deposit section');
assert(servicesContent.includes('Daily Balance Basis') || servicesContent.includes('Daily Balance'), 'services.html specifies Daily Balance interest calculation');
assert(servicesContent.includes('September') && servicesContent.includes('March'), 'services.html specifies bi-annual interest credit in September and March');
assert(servicesContent.includes('4 withdrawals per week') || servicesContent.includes('4 withdrawals'), 'services.html specifies 4 withdrawals per week limit');
assert(servicesContent.includes('10.00 per year') || servicesContent.includes('10/Yr') || servicesContent.includes('10 രൂപ'), 'services.html specifies 10 per year maintenance fee');

// Monthly Savings Scheme (MSS) Verification
assert(servicesContent.includes('Monthly Savings Scheme'), 'services.html contains Monthly Savings Scheme section');
assert(servicesContent.includes('20 to 100'), 'services.html specifies MSS group size 20 to 100 members/months');
assert(servicesContent.includes('10% of tickets or 5 tickets') || servicesContent.includes('10% of total group tickets or 5 tickets'), 'services.html specifies MSS ticket ceiling (10% or 5 tickets)');
assert(servicesContent.includes('90%'), 'services.html specifies MSS advance facility up to 90%');
assert(servicesContent.includes('5% Society Commission') || servicesContent.includes('5% commission'), 'services.html specifies MSS 5% society commission deduction');
assert(servicesContent.includes('40 Groups') || servicesContent.includes('40 groups'), 'services.html specifies MSS 40 groups limit');
assert(servicesContent.includes('4 Crores') || servicesContent.includes('4.00 Crores') || servicesContent.includes('4 കോടി'), 'services.html specifies MSS 4 Crores portfolio ceiling');

// Group Deposit Scheme (GDS) Verification
assert(servicesContent.includes('Group Deposit Scheme'), 'services.html contains Group Deposit Scheme section');
assert(servicesContent.includes('25 to 100'), 'services.html specifies GDS group size 25 to 100 members');
assert(servicesContent.includes('70% to 95%'), 'services.html specifies GDS monthly advance 70% to 95%');
assert(servicesContent.includes('2nd Saturday') || servicesContent.includes('second Saturday'), 'services.html specifies GDS 2nd Saturday draw');
assert(servicesContent.includes('11:00 AM') || servicesContent.includes('11 AM'), 'services.html specifies GDS draw time 11:00 AM');
assert(servicesContent.includes('Dividend Sharing') || servicesContent.includes('Dividend sharing'), 'services.html specifies GDS dividend sharing');

console.log('\n==================================================');
console.log('4. VERIFYING DOWNLOADS FORMS (downloads.html)');
console.log('==================================================');

const downloadsContent = fs.readFileSync(path.join(ROOT_DIR, 'downloads.html'), 'utf-8');

const expectedForms = [
  'Emergency Loan Application',
  'Hire Purchase Loan Application',
  'Medium Term Loan Application',
  'Festival Loan Application',
  'Deposit Loan Application',
  'Savings Deposit Application',
  'Recurring Deposit Application',
  'Fixed Deposit Application',
  'Education Award for Children',
  'Application for Loan Statement'
];

expectedForms.forEach(form => {
  assert(downloadsContent.includes(form), `downloads.html contains form: "${form}"`);
});

assert(downloadsContent.includes('assets/downloads/savings-deposit-application.pdf'), 'downloads.html has direct link to savings-deposit-application.pdf');
assert(servicesContent.includes('assets/downloads/savings-deposit-application.pdf'), 'services.html has direct link to savings-deposit-application.pdf');
assert(downloadsContent.includes('assets/downloads/recurring-deposit-application.pdf'), 'downloads.html has direct link to recurring-deposit-application.pdf');
assert(servicesContent.includes('assets/downloads/recurring-deposit-application.pdf'), 'services.html has direct link to recurring-deposit-application.pdf');
assert(downloadsContent.includes('assets/downloads/fixed-deposit-application.pdf'), 'downloads.html has direct link to fixed-deposit-application.pdf');
assert(servicesContent.includes('assets/downloads/fixed-deposit-application.pdf'), 'services.html has direct link to fixed-deposit-application.pdf');
assert(downloadsContent.includes('assets/downloads/education-award-application.pdf'), 'downloads.html has direct link to education-award-application.pdf');
assert(downloadsContent.includes('assets/downloads/loan-statement-application.pdf'), 'downloads.html has direct link to loan-statement-application.pdf');
const noticesPageContent = fs.readFileSync(path.join(ROOT_DIR, 'notices.html'), 'utf-8');
assert(noticesPageContent.includes('assets/downloads/education-award-application.pdf'), 'notices.html has direct link to education-award-application.pdf');

console.log('\n==================================================');
console.log('5. VERIFYING INSTITUTIONAL IDENTITY & REGISTRATION');
console.log('==================================================');

REQUIRED_PAGES.forEach(page => {
  const content = fs.readFileSync(path.join(ROOT_DIR, page), 'utf-8');
  assert(content.includes('WAYANAD DISTRICT POLICE') || content.includes('Wayanad District Police'), `${page} has correct society name`);
  assert(content.includes('W 208'), `${page} has society registration number W 208`);
  assert(content.includes('header-search-btn'), `${page} has header search button`);
  assert(content.includes('headerSearchModal'), `${page} has header search modal`);
  assert(content.includes('site-footer'), `${page} has standardized footer`);
  assert(content.includes('04936 205940') || content.includes('04936205940'), `${page} contains official telephone 04936 205940`);
});

console.log('\n==================================================');
console.log('5.1 VERIFYING ABOUT THE SOCIETY (about.html) DETAILS');
console.log('==================================================');

const aboutContent = fs.readFileSync(path.join(ROOT_DIR, 'about.html'), 'utf-8');
assert(aboutContent.includes('24 May 1996'), 'about.html contains Registration Date: 24 May 1996');
assert(aboutContent.includes('21 August 1996'), 'about.html contains Commencement Date: 21 August 1996');
assert(aboutContent.includes('Class 1 Special Grade'), 'about.html contains Class 1 Special Grade classification');
assert(aboutContent.includes('Employees Society since 2021'), 'about.html contains Employees Society since 2021');
assert(aboutContent.includes("Best Employees' Co-operative Society in Wayanad District"), 'about.html contains recognition award');
assert(aboutContent.includes('SATHEESH KUMAR P G'), 'about.html contains President: SATHEESH KUMAR P G');
assert(aboutContent.includes('BIPIN SUNNY'), 'about.html contains Vice President: BIPIN SUNNY');

const expectedDirectors = [
  'MOHANAN M',
  'ERSHAD MUBARAK',
  'AJEESH P S',
  'RAJESH V S',
  'SHEEJA A R',
  'VINEESHA C',
  'ARSHADA N P'
];
expectedDirectors.forEach(dir => {
  assert(aboutContent.includes(dir), `about.html contains Director: ${dir}`);
});
assert(fs.existsSync(path.join(ROOT_DIR, 'assets/images/director-ajeesh-p-s.jpg')), 'director-ajeesh-p-s.jpg photo asset exists');
assert(aboutContent.includes('assets/images/director-ajeesh-p-s.jpg'), 'about.html references director-ajeesh-p-s.jpg photo');

console.log('\n==================================================');
console.log('6. VERIFYING SUPPORTING & LEGAL PAGES SPECIFICS');
console.log('==================================================');

// 6.1 Privacy Policy
const privacyContent = fs.readFileSync(path.join(ROOT_DIR, 'privacy-policy.html'), 'utf-8');
const privacySections = [
  'Introduction',
  'Information We Collect',
  'Information Submitted Through Enquiry Forms',
  'How Information Is Used',
  'Information Sharing',
  'Document Downloads',
  'External Websites and Booking Applications',
  'Cookies and Website Analytics',
  'Data Security',
  'Data Retention',
  'User Rights',
  'Changes to This Privacy Policy',
  'Contact Information'
];
privacySections.forEach(sec => {
  assert(privacyContent.includes(sec), `privacy-policy.html includes section: "${sec}"`);
});
assert(!privacyContent.includes('Effective Date:'), 'privacy-policy.html omits Effective Date indicator');

// 6.2 Terms & Conditions
const termsContent = fs.readFileSync(path.join(ROOT_DIR, 'terms.html'), 'utf-8');
const termsSections = [
  'Acceptance of Terms',
  'Website Use',
  'Accuracy of Information',
  'Services and Product Information',
  'Application Forms',
  'Downloaded Documents',
  'External Links',
  'External Booking Services',
  'Intellectual Property',
  'Website Availability',
  'Limitation of Responsibility',
  'Changes to Website Content',
  'Contact Information'
];
termsSections.forEach(sec => {
  assert(termsContent.includes(sec), `terms.html includes section: "${sec}"`);
});
assert(
  termsContent.includes('Official terms, conditions, rules and eligibility criteria of the society shall prevail'),
  'terms.html includes mandatory prevailing clause'
);

// 6.3 Disclaimer
const disclaimerContent = fs.readFileSync(path.join(ROOT_DIR, 'disclaimer.html'), 'utf-8');
assert(
  disclaimerContent.includes('For official or transaction-related matters, members should contact the society directly through its authorised communication channels.'),
  'disclaimer.html contains mandatory prominent transaction notice'
);

// 6.4 Accessibility Statement
const accessContent = fs.readFileSync(path.join(ROOT_DIR, 'accessibility.html'), 'utf-8');
assert(accessContent.includes('Accessibility Feedback'), 'accessibility.html contains feedback section');
assert(accessContent.includes('Last Reviewed:'), 'accessibility.html contains Last Reviewed indicator');
assert(accessContent.includes('wdpcs.208@gmail.com'), 'accessibility.html contains official accessibility email wdpcs.208@gmail.com');

// 6.5 Notices & Circulars
const noticesContent = fs.readFileSync(path.join(ROOT_DIR, 'notices.html'), 'utf-8');
assert(noticesContent.includes('notice-category-row') || noticesContent.includes('notice-filter-pill'), 'notices.html contains category filter');
assert(noticesContent.includes('noticeYearSelect'), 'notices.html contains year filter');
assert(noticesContent.includes('noticeSearchInput'), 'notices.html contains notices search');
assert(noticesContent.includes('General Notices'), 'notices.html contains General Notices category');
assert(noticesContent.includes('Loan Notices'), 'notices.html contains Loan Notices category');
assert(noticesContent.includes('Deposit Notices'), 'notices.html contains Deposit Notices category');

// 6.6 FAQ Page
const faqContent = fs.readFileSync(path.join(ROOT_DIR, 'faq.html'), 'utf-8');
const faqCategories = [
  'General',
  'Deposits',
  'Loans',
  'Applications &amp; Documents',
  'Society Rooms &amp; Dormitories'
];
faqCategories.forEach(cat => {
  assert(faqContent.includes(cat), `faq.html includes FAQ category: "${cat}"`);
});
assert(faqContent.includes('accordion-header') || faqContent.includes('faq-item'), 'faq.html contains accordion items');

// 6.7 Global Search Results
const searchContent = fs.readFileSync(path.join(ROOT_DIR, 'search.html'), 'utf-8');
assert(searchContent.includes('globalSearchInput'), 'search.html contains search input');
assert(searchContent.includes('searchKeywordDisplay'), 'search.html displays search keyword');
assert(searchContent.includes('searchNoResultsState'), 'search.html contains no-results state');

// 6.8 404 Page
const notFoundContent = fs.readFileSync(path.join(ROOT_DIR, '404.html'), 'utf-8');
assert(notFoundContent.includes('Page Not Found'), '404.html contains Page Not Found title');
assert(notFoundContent.includes('Go to Homepage'), '404.html contains Go to Homepage CTA');
assert(notFoundContent.includes('Search Website'), '404.html contains Search Website CTA');

// 7. OFFICIAL INSTITUTIONAL CONTACT INTEGRITY ACROSS ALL 16 PAGES
console.log('\n--- 7. Official Contact Integrity Across All 16 Pages ---');
REQUIRED_PAGES.forEach(page => {
  const content = fs.readFileSync(path.join(ROOT_DIR, page), 'utf-8');
  assert(content.includes('04936 205940') || content.includes('04936205940'), `${page} contains official landline 04936 205940`);
  assert(content.includes('8301995940'), `${page} contains official mobile 8301995940`);
  assert(content.includes('wdpcs.208@gmail.com'), `${page} contains official email wdpcs.208@gmail.com`);
  assert(content.includes('Kalpetta North') && content.includes('673122'), `${page} contains official address (Kalpetta North, 673122)`);
  assert(!content.includes('[SOCIETY ADDRESS]'), `${page} has no leftover [SOCIETY ADDRESS] placeholder`);
  assert(!content.includes('[MOBILE NUMBER]'), `${page} has no leftover [MOBILE NUMBER] placeholder`);
  assert(!content.includes('[EMAIL ADDRESS]'), `${page} has no leftover [EMAIL ADDRESS] placeholder`);
  assert(!content.includes('[ACCESSIBILITY EMAIL]'), `${page} has no leftover [ACCESSIBILITY EMAIL] placeholder`);
});

// WhatsApp Link & Working Hours verification
const contactHtml = fs.readFileSync(path.join(ROOT_DIR, 'contact.html'), 'utf-8');
assert(contactHtml.includes('wa.me/918301995940'), 'contact.html contains direct WhatsApp link');
assert(contactHtml.includes('10:00 AM') && contactHtml.includes('5:00 PM'), 'contact.html contains official working hours 10:00 AM to 5:00 PM');

const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf-8');
assert(indexHtml.includes('10:00 AM') && indexHtml.includes('5:00 PM'), 'index.html contains official working hours in topbar & notices');

const faqHtml = fs.readFileSync(path.join(ROOT_DIR, 'faq.html'), 'utf-8');
assert(faqHtml.includes('10:00 AM') && faqHtml.includes('5:00 PM'), 'faq.html contains official working hours in Q5');

const noticesHtml = fs.readFileSync(path.join(ROOT_DIR, 'notices.html'), 'utf-8');
assert(noticesHtml.includes('10:00 AM') && noticesHtml.includes('5:00 PM'), 'notices.html contains official working hours in Notice 3');

// Bank Account & UPI Details Verification (Strictly No QR Code as required)
assert(contactHtml.includes('wynddpc@sbi'), 'contact.html contains UPI ID wynddpc@sbi');
assert(contactHtml.includes('33175259937') && contactHtml.includes('SBIN0003035'), 'contact.html contains SBI Kainatty Account & IFSC');
assert(contactHtml.includes('171412002000112') && contactHtml.includes('KSBK0001714'), 'contact.html contains Kerala Bank Kalpetta Account & IFSC');
assert(!contactHtml.includes('qr-code') && !contactHtml.includes('qrcode') && !contactHtml.toLowerCase().includes('qr code'), 'contact.html strictly does not share QR code');
assert(contactHtml.includes('bank-sbi-icon.svg'), 'contact.html contains official SBI logo');
assert(contactHtml.includes('bank-kerala-logo.jpg') || contactHtml.includes('bank-kerala-icon.svg'), 'contact.html contains official Kerala Bank logo');
assert(contactHtml.includes('upi-icon.svg'), 'contact.html contains official UPI logo');
assert(faqHtml.includes('wynddpc@sbi'), 'faq.html contains UPI ID wynddpc@sbi');
assert(faqHtml.includes('33175259937') && faqHtml.includes('171412002000112'), 'faq.html contains Bank Account numbers in Remittance FAQ');

// 8. VERIFYING NEAT HEADER ALIGNMENT ACROSS ALL 16 PAGES
console.log('\n--- 8. Header Alignment & Structure Across All 16 Pages ---');
REQUIRED_PAGES.forEach(page => {
  const content = fs.readFileSync(path.join(ROOT_DIR, page), 'utf-8');
  assert(content.includes('class="site-header"'), `${page} contains .site-header`);
  assert(content.includes('class="society-brand"'), `${page} contains .society-brand`);
  assert(content.includes('class="brand-logo-wrap"'), `${page} contains .brand-logo-wrap`);
  assert(content.includes('class="header-right"'), `${page} contains .header-right wrapper`);
  assert(content.includes('class="main-nav"'), `${page} contains .main-nav`);
  assert(content.includes('class="header-actions"'), `${page} contains .header-actions`);
  assert(content.includes('class="header-search-btn"'), `${page} contains .header-search-btn`);
  assert(content.includes('class="nav-cta-btn"'), `${page} contains .nav-cta-btn`);
  assert(content.includes('class="mobile-menu-toggle"'), `${page} contains .mobile-menu-toggle`);
});

// 9. COMPLETE SEO, GEO, AEO, SCHEMA.ORG & CANONICAL VERIFICATION
console.log('\n--- 9. Complete SEO, GEO, AEO, Schema.org & Canonical Verification ---');

const PUBLIC_INDEXABLE_PAGES = REQUIRED_PAGES.filter(p => p !== '404.html');

PUBLIC_INDEXABLE_PAGES.forEach(page => {
  const content = fs.readFileSync(path.join(ROOT_DIR, page), 'utf-8');
  
  // Canonical check
  assert(content.includes('rel="canonical"'), `${page} contains canonical link`);
  assert(content.includes('https://wdpcs.github.io/wdpcs_official_website/'), `${page} contains canonical domain`);
  
  // Robots check
  assert(content.includes('<meta name="robots" content="index, follow">'), `${page} contains index, follow robots meta`);
  
  // Open Graph & Social Cards
  assert(content.includes('property="og:title"'), `${page} contains Open Graph title`);
  assert(content.includes('property="og:description"'), `${page} contains Open Graph description`);
  assert(content.includes('name="twitter:card"'), `${page} contains Twitter card`);
  
  // Manifest & Favicon
  assert(content.includes('site.webmanifest'), `${page} links to site.webmanifest`);
  assert(content.includes('assets/images/favicon.svg'), `${page} links to favicon`);
  
  // Skip to content for Accessibility
  assert(content.includes('class="skip-to-content"') || content.includes('class="skip-link"'), `${page} contains accessible skip link`);
  
  // Structured Data (JSON-LD)
  assert(content.includes('<script type="application/ld+json">'), `${page} contains JSON-LD structured data`);
  
  // Parse and validate JSON-LD
  const jsonLdMatch = content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert(jsonLdMatch && jsonLdMatch[1], `${page} has parseable JSON-LD content`);
  if (jsonLdMatch && jsonLdMatch[1]) {
    try {
      const parsedSchema = JSON.parse(jsonLdMatch[1]);
      assert(parsedSchema['@context'] === 'https://schema.org', `${page} JSON-LD context is schema.org`);
      assert(parsedSchema['@graph'] && Array.isArray(parsedSchema['@graph']), `${page} JSON-LD contains valid @graph array`);
    } catch (err) {
      assert(false, `${page} JSON-LD syntax error: ${err.message}`);
    }
  }
});

// 404 page robots check
const notFoundHtml = fs.readFileSync(path.join(ROOT_DIR, '404.html'), 'utf-8');
assert(notFoundHtml.includes('<meta name="robots" content="noindex, nofollow">'), '404.html contains noindex, nofollow meta');

// Robots.txt & Sitemap.xml Canonical Domain Checks
const robotsContent = fs.readFileSync(path.join(ROOT_DIR, 'robots.txt'), 'utf-8');
assert(robotsContent.includes('https://wdpcs.github.io/wdpcs_official_website/sitemap.xml'), 'robots.txt contains GitHub Pages canonical sitemap URL');
assert(robotsContent.includes('Allow: /'), 'robots.txt allows indexing');

const sitemapContent = fs.readFileSync(path.join(ROOT_DIR, 'sitemap.xml'), 'utf-8');
PUBLIC_INDEXABLE_PAGES.forEach(page => {
  const expectedUrl = page === 'index.html' 
    ? 'https://wdpcs.github.io/wdpcs_official_website/'
    : `https://wdpcs.github.io/wdpcs_official_website/${page}`;
  assert(sitemapContent.includes(expectedUrl), `sitemap.xml contains indexable URL: ${expectedUrl}`);
});

// 10. OFFICIAL WHATSAPP ENQUIRY FACILITY & INSTITUTIONAL CONTACT VERIFICATION
console.log('\n--- 10. Official WhatsApp Enquiry Facility & Institutional Contact Verification ---');
const contactFormHtml = fs.readFileSync(path.join(ROOT_DIR, 'contact.html'), 'utf-8');
const contactFormJs = fs.readFileSync(path.join(ROOT_DIR, 'js/contact.js'), 'utf-8');

assert(contactFormHtml.includes('8301995940'), 'contact.html explicitly features WhatsApp number 8301995940');
assert(contactFormHtml.includes('wdpcs.208@gmail.com'), 'contact.html explicitly states official mailbox wdpcs.208@gmail.com');
assert(contactFormHtml.includes('04936 205940') || contactFormHtml.includes('04936205940'), 'contact.html explicitly includes landline 04936 205940');
assert(contactFormHtml.includes('id="startWhatsAppChatBtn"'), 'contact.html contains #startWhatsAppChatBtn');
assert(contactFormHtml.includes('class="wa-topic-chip"'), 'contact.html contains 1-tap WhatsApp quick topic chips');
assert(contactFormJs.includes('8301995940'), 'js/contact.js targets society WhatsApp 8301995940');
assert(contactFormJs.includes('https://wa.me/'), 'js/contact.js creates official wa.me direct chat link');
assert(contactFormJs.includes('startWhatsAppChatBtn'), 'js/contact.js binds click event to startWhatsAppChatBtn');

console.log('\n==================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} tests passed (${failedTests} failures)`);
console.log('==================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('\n>>> ALL INSTITUTIONAL WEBSITE INTEGRITY TESTS PASSED SUCCESSFULLY! <<<');
  process.exit(0);
}


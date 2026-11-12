'use strict';

const config = require('../config/env');
const { hashPassword } = require('../utils/crypto');

const PERMISSIONS = [
  { code: 'dashboard:view', module: 'Dashboard', description: 'View administration dashboard and summary metrics' },
  { code: 'content:view', module: 'General Content', description: 'View general and homepage content' },
  { code: 'content:edit', module: 'General Content', description: 'Edit drafts for general content, homepage, and Santhwanam' },
  { code: 'content:publish', module: 'General Content', description: 'Approve and publish non-financial website content' },
  { code: 'financial:view', module: 'Interest & Products', description: 'View deposits, loans, and interest rate history' },
  { code: 'financial:edit', module: 'Interest & Products', description: 'Update deposit, loan, and interest rate drafts' },
  { code: 'financial:publish', module: 'Interest & Products', description: 'Approve and publish interest rate and financial updates' },
  { code: 'notices:manage', module: 'Notices', description: 'Create, edit, archive notices & circulars' },
  { code: 'notices:publish', module: 'Notices', description: 'Publish or approve notices & circulars' },
  { code: 'gallery:manage', module: 'Gallery', description: 'Upload, edit narration/audio, reorder, archive gallery photos' },
  { code: 'gallery:publish', module: 'Gallery', description: 'Publish or approve gallery photos' },
  { code: 'downloads:manage', module: 'Downloads', description: 'Upload, replace PDF versions, archive forms' },
  { code: 'downloads:publish', module: 'Downloads', description: 'Publish or approve downloadable forms' },
  { code: 'faqs:manage', module: 'FAQs', description: 'Create, edit, reorder, archive FAQs' },
  { code: 'faqs:publish', module: 'FAQs', description: 'Publish or approve FAQs' },
  { code: 'santhwanam:manage', module: 'Santhwanam', description: 'Edit Santhwanam welfare scheme content' },
  { code: 'santhwanam:publish', module: 'Santhwanam', description: 'Publish or approve Santhwanam content' },
  { code: 'users:view', module: 'Users & Roles', description: 'View admin accounts and role definitions' },
  { code: 'users:manage', module: 'Users & Roles', description: 'Create, edit, deactivate, reset admin accounts' },
  { code: 'roles:manage', module: 'Users & Roles', description: 'Modify role permission assignments' },
  { code: 'audit:view', module: 'Activity Logs', description: 'View and export immutable administrative activity logs' },
  { code: 'settings:manage', module: 'Settings & Backups', description: 'Manage workflow settings and create/download backups' }
];

const ROLE_DEFINITIONS = [
  {
    slug: 'super_admin',
    name: 'Super Administrator',
    description: 'Full unrestricted administrative control, user & role management, approvals, backups, and security settings.',
    permissions: PERMISSIONS.map(p => p.code)
  },
  {
    slug: 'content_admin',
    name: 'Content Administrator',
    description: 'Manages general society information, homepage highlights, notices, gallery photos & narration, FAQs, downloads, and Santhwanam text.',
    permissions: [
      'dashboard:view', 'content:view', 'content:edit', 'content:publish',
      'financial:view', 'notices:manage', 'notices:publish',
      'gallery:manage', 'gallery:publish', 'downloads:manage', 'downloads:publish',
      'faqs:manage', 'faqs:publish', 'santhwanam:manage', 'santhwanam:publish',
      'audit:view'
    ]
  },
  {
    slug: 'financial_admin',
    name: 'Financial Information Administrator',
    description: 'Manages deposit schemes, loan products, and interest rate updates with historical audit retention.',
    permissions: [
      'dashboard:view', 'content:view', 'financial:view', 'financial:edit', 'financial:publish',
      'downloads:manage', 'audit:view'
    ]
  },
  {
    slug: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to view published/draft previews, interest rate history, and activity logs without making changes.',
    permissions: [
      'dashboard:view', 'content:view', 'financial:view', 'audit:view'
    ]
  }
];

function seedBaseData(db, options = {}) {
  const createSuperAdmin = options.createSuperAdmin !== false;
  const adminPassword = options.adminPassword || config.initAdmin.password;

  // 1. Seed Roles & Permissions
  const insertPerm = db.prepare(`INSERT OR IGNORE INTO permissions (code, module, description) VALUES (?, ?, ?)`);
  for (const p of PERMISSIONS) {
    insertPerm.run(p.code, p.module, p.description);
  }

  const insertRole = db.prepare(`INSERT OR IGNORE INTO roles (slug, name, description, is_system) VALUES (?, ?, ?, 1)`);
  const insertRolePerm = db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`);

  for (const r of ROLE_DEFINITIONS) {
    insertRole.run(r.slug, r.name, r.description);
    const roleRow = db.prepare(`SELECT id FROM roles WHERE slug = ?`).get(r.slug);
    for (const permCode of r.permissions) {
      const permRow = db.prepare(`SELECT id FROM permissions WHERE code = ?`).get(permCode);
      if (roleRow && permRow) {
        insertRolePerm.run(roleRow.id, permRow.id);
      }
    }
  }

  // 2. Seed System Settings
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description)
    VALUES (?, ?, ?)
  `);
  insertSetting.run('require_approval_financial', String(config.defaultRequireApprovalFinancial), 'Require approval step before Interest Rate changes publish live');
  insertSetting.run('require_approval_content', String(config.defaultRequireApprovalContent), 'Require approval step before general content changes publish live');
  insertSetting.run('admin_portal_url', config.adminBaseUrl, 'Configured administration portal canonical URL');
  insertSetting.run('public_site_url', config.publicSiteOrigins[0] || 'https://www.wdpcs.in', 'Public website canonical URL');
  insertSetting.run('backup_retention_count', '15', 'Recommended number of snapshot backups retained on disk');

  // 3. Seed Initial Super Administrator ONLY if no users exist yet
  let createdAdminInfo = null;
  if (createSuperAdmin) {
    const userCount = db.prepare(`SELECT COUNT(*) AS cnt FROM admin_users`).get().cnt;
    if (userCount === 0 && adminPassword) {
      const superRole = db.prepare(`SELECT id FROM roles WHERE slug = 'super_admin'`).get();
      db.prepare(`
        INSERT INTO admin_users (username, email, full_name, password_hash, role_id, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(
        config.initAdmin.username,
        config.initAdmin.email,
        config.initAdmin.fullName,
        hashPassword(adminPassword),
        superRole.id
      );
      createdAdminInfo = {
        username: config.initAdmin.username,
        email: config.initAdmin.email
      };
    }
  }

  // 4. Seed Website Content (General + Homepage + Governance + Contact)
  const websiteSections = [
    {
      section_key: 'general_about',
      module_group: 'general',
      title: 'About the Society & History',
      payload: {
        headline: 'Empowering Our Police Force Through Financial Solidarity',
        introHtml: '<p><strong>Wayanad District Police Co-operative Society Ltd. No. W 208</strong> was registered on <strong>24 May 1996</strong> and commenced its operations on <strong>21 August 1996</strong>.</p>',
        historyHtml: '<p>The society was established with a vital purpose: to provide police personnel with a dependable and dedicated financial support system at a time when access to institutional credit was challenging. Under visionary police leadership and district association pioneers, it has grown over nearly three decades into a trusted financial pillar.</p>',
        mission: 'To continue serving as a primary financial pillar for police personnel and their families by providing accessible, ethical and member-centric co-operative financial services founded on mutual trust, collective responsibility and shared growth.',
        vision: 'A resilient, member-owned financial institution upholding mutual co-operation, welfare support, transparent governance, and lifelong economic security for Wayanad District Police personnel.',
        registrationDate: '24 May 1996',
        commencementDate: '21 August 1996',
        classification: 'Class 1 Special Grade (Employees Society since 2021)'
      }
    },
    {
      section_key: 'general_contact',
      module_group: 'contact',
      title: 'Contact Details & Office Hours',
      payload: {
        organizationName: 'Wayanad District Police Co-operative Society Ltd. No. W 208',
        addressLine1: 'Kalpetta North (PO), Wayanad - 673122',
        addressLine2: 'Kerala, India',
        telephone: '04936 205940',
        mobile: '8301995940',
        email: 'wdpcs.208@gmail.com',
        officeHours: '10:00 AM to 5:00 PM',
        officeHoursNote: 'Closed on Sundays, Public Holidays, and State Government Co-operative Holidays.'
      }
    },
    {
      section_key: 'general_governance',
      module_group: 'governance',
      title: 'Board of Directors & Staff Information',
      payload: {
        boardIntro: 'Leadership through member representation. The society is governed by a Board of Directors comprising nine members elected from among the A Class members.',
        directors: [
          { role: 'President', name: 'SATHEESH KUMAR P G', phone: '+91 99612 58392', photo: 'assets/images/director-satheesh-kumar-p-g.jpg' },
          { role: 'Vice President', name: 'BIPIN SUNNY', phone: '+91 99614 57642', photo: 'assets/images/director-bipin-sunny.jpg' },
          { role: 'Director', name: 'MOHANAN M', phone: '+91 94966 64848', photo: 'assets/images/director-mohanan-m.jpg' },
          { role: 'Director', name: 'ERSHAD MUBARAK', phone: '+91 82819 69826', photo: 'assets/images/director-ershad-mubarak.jpg' },
          { role: 'Director', name: 'AJEESH P S', phone: '+91 97476 01263', photo: 'assets/images/director-ajeesh-p-s.jpg' },
          { role: 'Director', name: 'RAJESH V S', phone: '+91 94957 60022', photo: 'assets/images/director-rajesh-v-s.jpg' },
          { role: 'Director', name: 'SHEEJA A R', phone: '+91 94979 35239', photo: 'assets/images/director-sheeja-a-r.jpg' },
          { role: 'Director', name: 'VINEESHA C', phone: '+91 94959 44134', photo: 'assets/images/director-vineesha-c.jpg?v=2' },
          { role: 'Director', name: 'ARSHADA N P', phone: '+91 83300 50223', photo: 'assets/images/director-arshada-n-p.jpg' }
        ],
        secretary: {
          role: 'Secretary',
          name: 'RAJANI K K',
          summary: 'Chief administrative officer managing executive operations, official communications, and day-to-day administrative affairs of the society.',
          photo: 'assets/images/secretary-rajani-k-k.jpg?v=2'
        },
        staffNote: 'Dedicated society office team serving member accounts, loans, welfare schemes, and dormitory operations during working hours.'
      }
    },
    {
      section_key: 'homepage_management',
      module_group: 'homepage',
      title: 'Homepage Highlights & Announcement Bar',
      payload: {
        announcementBanner: 'Serving Wayanad Police Personnel & Families Since 1996 • Class 1 Special Grade Co-operative Society',
        aboutPreviewTitle: 'Serving Wayanad District Police Personnel with Trust & Transparency',
        aboutPreviewText: 'Registered on 24 May 1996, Wayanad District Police Co-operative Society Ltd. No. W 208 extends dependable deposits, member credit facilities, Santhwanam welfare support, and Kalpetta accommodation.',
        santhwanamHighlightTitle: 'Santhwanam Welfare Scheme',
        santhwanamHighlightText: 'One-time ₹500 lifetime premium providing financial assistance for eligible medical treatment and death benefit support to enrolled member families.',
        showLatestNoticesCount: 4,
        showGalleryPreviewCount: 4
      }
    }
  ];

  const insertWebsiteContent = db.prepare(`
    INSERT OR IGNORE INTO website_content
      (section_key, module_group, title, published_payload, draft_payload, workflow_status, version_number, published_at)
    VALUES (?, ?, ?, ?, ?, 'Published', 1, datetime('now'))
  `);

  for (const s of websiteSections) {
    const json = JSON.stringify(s.payload);
    insertWebsiteContent.run(s.section_key, s.module_group, s.title, json, json);
  }

  // 5. Seed Deposit Products (5 categories)
  const deposits = [
    {
      slug: 'savings-deposit',
      product_name: 'Savings Deposit',
      category_label: 'Deposit Account 1',
      interest_rate: 'As Fixed by Registrar',
      rate_type: 'Regulator-Fixed Rate (Annual)',
      effective_from: '2025-04-01',
      min_amount: '₹100.00 (₹250.00 with Cheque Book)',
      tenure: 'Flexible / On Demand',
      eligibility: 'All active society members',
      description: 'Flexible liquid savings account designed for regular salary deposits and convenient withdrawals with passbook and cheque facilities.',
      specs: [
        ['Account Category', 'Individuals & Society Employees'],
        ['Minimum Balance', '₹100 (Ordinary) / ₹250 (Cheque Book)'],
        ['Large Withdrawals', '15 Days Notice required above ₹25,000'],
        ['Maximum Deposit Ceiling', 'Up to ₹10,00,000 at applicable rate']
      ],
      form_slug: 'savings-deposit-application',
      order: 1
    },
    {
      slug: 'recurring-deposit',
      product_name: 'Recurring Deposit',
      category_label: 'Deposit Account 2',
      interest_rate: 'As Determined by Registrar',
      rate_type: 'Annual / Statutory Co-op Rate',
      effective_from: '2025-04-01',
      min_amount: '₹100.00 per month (multiples of ₹100)',
      tenure: '12 Months to 120 Months',
      eligibility: 'All Society members (Single, Multiple, or Joint)',
      description: 'Systematic monthly savings plan helping members build disciplined long-term capital for planned milestones.',
      specs: [
        ['Minimum Monthly Deposit', '₹100.00 or in multiples of ₹100'],
        ['Tenure Options', '12 to 120 Months (multiples of 12 months)'],
        ['Deposit Loan Facility', 'Up to 75% of paid-up deposit balance'],
        ['Premature Closure', 'Permitted under special circumstances (SB rate)']
      ],
      form_slug: 'recurring-deposit-application',
      order: 2
    },
    {
      slug: 'fixed-deposit',
      product_name: 'Fixed Deposit',
      category_label: 'Deposit Account 3',
      interest_rate: 'As Approved by Society / Registrar',
      rate_type: 'Annual / Term Slab Basis',
      effective_from: '2025-04-01',
      min_amount: '₹500.00 (Min. ₹25,000 for monthly payout)',
      tenure: '15 Days to Multi-Year Flexible Tenures',
      eligibility: 'Individuals, Joint accounts, Institutions & Minors (Guardian)',
      description: 'Term deposit offering guaranteed security and competitive returns for member funds deposited for a specific duration.',
      specs: [
        ['Interest Payout', 'Monthly, Quarterly, Half-Yearly, Annually, or Maturity'],
        ['Deposit Loan Facility', '80% to 90% of deposit value'],
        ['Auto Transfer', 'Direct credit to SB or Loan Account']
      ],
      form_slug: 'fixed-deposit-application',
      order: 3
    },
    {
      slug: 'monthly-savings-scheme',
      product_name: 'Monthly Savings Scheme',
      category_label: 'Thrift Scheme 1',
      interest_rate: 'Group Maturity & Bonus Structure',
      rate_type: 'Co-operative Scheme Basis',
      effective_from: '2025-04-01',
      min_amount: 'Monthly Group Instalment',
      tenure: '20 to 100 Months',
      eligibility: 'A-Class and D-Class members of the Society',
      description: 'Specialized savings scheme engineered to encourage regular monthly thrift with favorable bonus interest provisions upon timely completion.',
      specs: [
        ['Group Size & Tenure', '20 to 100 Months / Members'],
        ['Advance Facility', 'Up to 90% of deposited balance'],
        ['Portfolio Cap', 'Up to 40 Groups & ₹4 Crores total scheme portfolio']
      ],
      form_slug: null,
      order: 4
    },
    {
      slug: 'group-deposit-scheme',
      product_name: 'Group Deposit Scheme',
      category_label: 'Group Scheme 2',
      interest_rate: 'Pool Auction & Dividend Structure',
      rate_type: 'Co-operative Draw Basis',
      effective_from: '2025-04-01',
      min_amount: 'Multiples of ₹100 monthly',
      tenure: '25 to 100 Months',
      eligibility: 'A-Class and D-Class members & Society employees',
      description: 'A collective co-operative deposit mechanism facilitating mutual thrift and monthly credit access among member police personnel.',
      specs: [
        ['Draw Schedule', '2nd Saturday of every month at 11:00 AM'],
        ['Monthly Advance', '70% to 95% of group instalment pool'],
        ['Dividend Sharing', 'Excess sum after 5% service charge shared equally']
      ],
      form_slug: null,
      order: 5
    }
  ];

  const insertDeposit = db.prepare(`
    INSERT OR IGNORE INTO deposit_products
      (slug, product_name, category_label, interest_rate, rate_type, effective_from, min_amount, tenure, eligibility, description, specs_json, form_slug, status, workflow_status, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 'Published', ?)
  `);
  for (const d of deposits) {
    insertDeposit.run(
      d.slug, d.product_name, d.category_label, d.interest_rate, d.rate_type,
      d.effective_from, d.min_amount, d.tenure, d.eligibility, d.description,
      JSON.stringify(d.specs), d.form_slug, d.order
    );
  }

  // 6. Seed Loan Products (5 categories)
  const loans = [
    {
      slug: 'emergency-loan',
      product_name: 'Emergency Loan',
      category_label: 'Loan Product 1',
      interest_rate: '10% p.a.',
      rate_type: 'Annual (p.a.)',
      effective_from: '2025-04-01',
      max_amount: '₹1,00,000.00',
      tenure: '12 Months',
      repayment_mode: 'Non-EMI',
      eligibility: 'Police department personnel & society members in Wayanad District',
      required_documents: 'Prescribed Application Form, Salary Recovery Authorization & Department ID',
      description: 'Expedited credit facility created to provide urgent financial relief to member police personnel facing emergent domestic or medical needs without prolonged approval cycles.',
      form_slug: 'emergency-loan-application',
      order: 1
    },
    {
      slug: 'hire-purchase-loan',
      product_name: 'Hire Purchase Loan',
      category_label: 'Loan Product 2',
      interest_rate: '10% p.a.',
      rate_type: 'Annual (p.a.)',
      effective_from: '2025-04-01',
      max_amount: '₹2,00,000.00',
      tenure: 'Up to 48 Months',
      repayment_mode: 'Non-EMI',
      eligibility: 'Regular members of the society for purchasing durables & equipment',
      required_documents: 'Prescribed Application Form, Merchant Quotation / Invoice & Recovery Agreement',
      description: 'Structured asset purchase loan enabling members to acquire essential household equipment, computers, home appliances, and two-wheelers with manageable monthly instalments.',
      form_slug: 'consumer-goods-loan-application',
      order: 2
    },
    {
      slug: 'medium-term-loan',
      product_name: 'Medium Term Loan',
      category_label: 'Loan Product 3',
      interest_rate: '10% p.a.',
      rate_type: 'Annual (p.a.)',
      effective_from: '2025-04-01',
      max_amount: '₹20,00,000.00',
      tenure: 'Up to 120 Months',
      repayment_mode: 'EMI',
      eligibility: 'Regular members with qualifying service length & net repayment capacity',
      required_documents: 'Prescribed Application Form, Salary Slips / Certificates & Surety Undertakings',
      description: 'Mid-range credit product providing higher borrowing limits with longer amortization schedules tailored around member repayment capabilities.',
      form_slug: 'medium-term-loan-application',
      order: 3
    },
    {
      slug: 'festival-loan',
      product_name: 'Festival Loan',
      category_label: 'Loan Product 4',
      interest_rate: '9% p.a.',
      rate_type: 'Annual (p.a.)',
      effective_from: '2025-04-01',
      max_amount: '₹20,000.00',
      tenure: '5 Months',
      repayment_mode: 'Non-EMI',
      eligibility: 'Active society members prior to notified state festival occasions',
      required_documents: 'Prescribed Application Form & Salary Recovery Authorization',
      description: 'Special seasonal financial support disbursed prior to major state festivals to help police personnel meet festive and family requirements with ease.',
      form_slug: 'festival-loan-application',
      order: 4
    },
    {
      slug: 'deposit-loan',
      product_name: 'Deposit Loan',
      category_label: 'Loan Product 5',
      interest_rate: 'Margin over Deposit Rate',
      rate_type: 'Co-terminus Overdraft Margin',
      effective_from: '2025-04-01',
      max_amount: 'Up to 90% of Deposit',
      tenure: 'Co-terminus',
      repayment_mode: 'Flexible / At Maturity',
      eligibility: 'Members holding active Fixed Deposits or Recurring Deposits with Society',
      required_documents: 'Original Deposit Receipt / Passbook & Lien Application',
      description: 'Enables members to borrow instantly against their existing fixed or recurring deposit balances without premature liquidation, preserving accrued tenure benefits.',
      form_slug: 'deposit-loan-overdraft-application',
      order: 5
    }
  ];

  const insertLoan = db.prepare(`
    INSERT OR IGNORE INTO loan_products
      (slug, product_name, category_label, interest_rate, rate_type, effective_from, max_amount, tenure, repayment_mode, eligibility, required_documents, description, form_slug, status, workflow_status, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 'Published', ?)
  `);
  for (const l of loans) {
    insertLoan.run(
      l.slug, l.product_name, l.category_label, l.interest_rate, l.rate_type,
      l.effective_from, l.max_amount, l.tenure, l.repayment_mode, l.eligibility,
      l.required_documents, l.description, l.form_slug, l.order
    );
  }

  // Baseline initial interest rate history entries if empty
  const rateHistCount = db.prepare(`SELECT COUNT(*) AS cnt FROM interest_rate_history`).get().cnt;
  if (rateHistCount === 0) {
    const insertHist = db.prepare(`
      INSERT INTO interest_rate_history
        (product_type, product_id, product_name, previous_rate, new_rate, rate_type, effective_from, change_reason, approval_status, changed_by_name, approved_by_name, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Approved', 'System Initialization', 'Board Resolution Baseline', datetime('now'))
    `);
    for (const row of db.prepare(`SELECT id, product_name, interest_rate, rate_type, effective_from FROM deposit_products`).all()) {
      insertHist.run('deposit', row.id, row.product_name, 'Initial Schedule', row.interest_rate, row.rate_type, row.effective_from, 'Initial CMS baseline synchronized from published website');
    }
    for (const row of db.prepare(`SELECT id, product_name, interest_rate, rate_type, effective_from FROM loan_products`).all()) {
      insertHist.run('loan', row.id, row.product_name, 'Initial Schedule', row.interest_rate, row.rate_type, row.effective_from, 'Initial CMS baseline synchronized from published website');
    }
  }

  // 7. Seed Notices & Circulars (matching static website notices)
  const noticesCount = db.prepare(`SELECT COUNT(*) AS cnt FROM notices`).get().cnt;
  if (noticesCount === 0) {
    const seedNotices = [
      {
        title: 'Medium Term Loan Ceiling & Interest Schedule Advisory (10% p.a.)',
        category: 'loan',
        ref: 'WDPCS/LN/2026-04',
        summary: 'Medium Term Loan facility remains active up to ₹20,00,000.00 at 10% p.a. (EMI repayment up to 120 months) for eligible A-Class members.',
        publish_date: '2026-04-15',
        is_featured: 1
      },
      {
        title: 'Santhwanam Welfare Scheme — Official Enrolment & Treatment Aid Forms Available',
        category: 'member',
        ref: 'WDPCS/SW/2026-02',
        summary: 'Enrolled members may remit the one-time ₹500 lifetime premium and download official Santhwanam Application and Request for Treatment Aid forms from the Downloads library.',
        publish_date: '2026-03-20',
        is_featured: 1
      },
      {
        title: 'Fixed Deposit & Recurring Deposit Facility — Loan Against Deposit Up to 90%',
        category: 'deposit',
        ref: 'WDPCS/DEP/2026-01',
        summary: 'Members holding Fixed or Recurring Deposits can avail instant Deposit Loans up to 90% of deposit balance without premature closure.',
        publish_date: '2026-02-10',
        is_featured: 1
      },
      {
        title: 'Society Rooms & Dormitory Facility Reservation Desk — Kalpetta North',
        category: 'rooms',
        ref: 'WDPCS/RM/2026-03',
        summary: 'AC/Non-AC guest rooms and dormitory accommodation at the Society Headquarters, Kalpetta North are open for advance reservation through the Society Office.',
        publish_date: '2026-01-25',
        is_featured: 1
      }
    ];
    const insertNotice = db.prepare(`
      INSERT INTO notices (title, category, reference_number, summary, body_html, publish_date, is_featured, workflow_status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Published', datetime('now'))
    `);
    for (const n of seedNotices) {
      insertNotice.run(n.title, n.category, n.ref, n.summary, `<p>${n.summary}</p>`, n.publish_date, n.is_featured);
    }
  }

  // 8. Seed Gallery Images (matching existing public site archives)
  const galleryCount = db.prepare(`SELECT COUNT(*) AS cnt FROM gallery_images`).get().cnt;
  if (galleryCount === 0) {
    const seedGallery = [
      {
        title: 'Unveiling the Official Building Plaque by Hon. Minister Sri K. P. Mohanan',
        category: 'inauguration',
        album_name: 'New Society Building Inauguration (30 December 2014)',
        event_date: '2014-12-30',
        caption_summary: 'New Society Building Inauguration by Hon. Minister for Agriculture Sri K. P. Mohanan in the presence of ADGP Sri N. Sankar Reddy IPS, DPC Sri Vimaladitya IPS, and President Sri K. P. Radhakrishnan.',
        image_path: 'assets/images/building-inauguration-2014-1.jpg',
        thumbnail_path: 'assets/images/building-inauguration-2014-1.jpg',
        is_featured: 1,
        order: 1
      },
      {
        title: 'Official Ribbon & Plaque Ceremony (30 Dec 2014)',
        category: 'inauguration',
        album_name: 'New Society Building Inauguration (30 December 2014)',
        event_date: '2014-12-30',
        caption_summary: 'Official inauguration ceremony of the Society Headquarters building in Kalpetta North.',
        image_path: 'assets/images/building-inauguration-2014-2.jpg',
        thumbnail_path: 'assets/images/building-inauguration-2014-2.jpg',
        is_featured: 1,
        order: 2
      },
      {
        title: 'Care Home 2018 — First House Handover Ceremony',
        category: 'carehome',
        album_name: 'Care Home 2018 — Rebuild Kerala Flood Relief Initiative',
        event_date: '2018-11-15',
        caption_summary: 'Key handover officially done by Hon. Joint Registrar (General) of Co-operative Societies, Wayanad in the presence of Hon. President Sri. Sunny Joseph under Rebuild Kerala 2018.',
        image_path: 'assets/images/rebuild-kerala-house-handover-2018.jpg',
        thumbnail_path: 'assets/images/rebuild-kerala-house-handover-2018.jpg',
        is_featured: 1,
        order: 3
      },
      {
        title: 'Care Home 2018 — Second House Handover Ceremony',
        category: 'carehome',
        album_name: 'Care Home 2018 — Rebuild Kerala Flood Relief Initiative',
        event_date: '2018-12-10',
        caption_summary: 'Second newly constructed house handover by Hon. MLA Kalpetta Sri C. K. Saseendran in the presence of Hon. President Sri Sunny Joseph and Managing Committee members.',
        image_path: 'assets/images/care-home-second-house-handover-2018.jpg',
        thumbnail_path: 'assets/images/care-home-second-house-handover-2018.jpg',
        is_featured: 1,
        order: 4
      }
    ];
    const insertGal = db.prepare(`
      INSERT INTO gallery_images (title, category, album_name, event_date, caption_summary, narration_html, image_path, thumbnail_path, is_featured, display_order, workflow_status, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Published', datetime('now'))
    `);
    for (const g of seedGallery) {
      insertGal.run(g.title, g.category, g.album_name, g.event_date, g.caption_summary, `<p>${g.caption_summary}</p>`, g.image_path, g.thumbnail_path, g.is_featured, g.order);
    }
  }

  // 9. Seed Documents (matching verified Downloads catalog, including ONLY the 2 locked Santhwanam forms)
  const docsCount = db.prepare(`SELECT COUNT(*) AS cnt FROM documents`).get().cnt;
  if (docsCount === 0) {
    const seedDocs = [
      { slug: 'emergency-loan-application', title: 'Emergency Loan Application (അടിയന്തിര വായ്പാ അപേക്ഷ)', category: 'loan', category_tag: 'Category 1 — Loan Application', form_code: 'WDPCS-LN-01', desc: 'Official prescribed form for Emergency Loan up to ₹1,00,000 at 10% p.a. interest (12 months Non-EMI) with salary recovery authorization.', tags: 'emergency loan urgent', file: 'assets/downloads/emergency-loan-application.pdf', size: 175000, page_info: 'PDF (2 Pages, Malayalam)', santhwanam_locked: 0, order: 1 },
      { slug: 'loan-voucher-promissory-note', title: 'Loan Voucher & Promissory Note', category: 'loan', category_tag: 'Category 1 — Loan Document', form_code: 'WDPCS-LN-02', desc: 'Mandatory institutional form containing disbursement receipt voucher and demand promissory note with witness verification.', tags: 'voucher promissory note', file: 'assets/downloads/loan-voucher-promissory-note.pdf', size: 163000, page_info: 'PDF (1 Page)', santhwanam_locked: 0, order: 2 },
      { slug: 'consumer-goods-loan-application', title: 'Consumer Goods & Hire Purchase Loan (ഗൃഹോപകരണ വായ്പ)', category: 'loan', category_tag: 'Category 1 — Loan Application', form_code: 'WDPCS-LN-03', desc: 'Official application for Hire Purchase Loan up to ₹2,00,000 (48 months Non-EMI) with Section 37 consent and dual sureties.', tags: 'hire purchase consumer goods', file: 'assets/downloads/consumer-goods-loan-application.pdf', size: 554000, page_info: 'PDF (4 Pages, Malayalam)', santhwanam_locked: 0, order: 3 },
      { slug: 'deposit-loan-overdraft-application', title: 'Deposit Loan Application (Loan / Overdraft Against Deposit)', category: 'loan', category_tag: 'Category 1 — Loan Application', form_code: 'WDPCS-LN-04', desc: 'Requisition to borrow up to 90% against pledged Fixed Deposit or Recurring Deposit receipts.', tags: 'deposit loan overdraft fd rd', file: 'assets/downloads/deposit-loan-overdraft-application.pdf', size: 65000, page_info: 'PDF (1 Page)', santhwanam_locked: 0, order: 4 },
      { slug: 'medium-term-loan-application', title: 'Medium Term Loan Application', category: 'loan', category_tag: 'Category 1 — Loan Application', form_code: 'WDPCS-LN-05', desc: 'Application for Medium Term Loan up to ₹20,00,000 at 10% p.a. (EMI up to 120 months).', tags: 'medium term loan emi', file: 'assets/downloads/medium-term-loan-application.pdf', size: 420000, page_info: 'PDF (4 Pages, Malayalam)', santhwanam_locked: 0, order: 5 },
      { slug: 'festival-loan-application', title: 'Festival Loan Application', category: 'loan', category_tag: 'Category 1 — Loan Application', form_code: 'WDPCS-LN-06', desc: 'Application form for seasonal Festival Loan up to ₹20,000 at 9% p.a. (5 months Non-EMI).', tags: 'festival loan onam vishu', file: 'assets/downloads/festival-loan-application.pdf', size: 120000, page_info: 'PDF (1 Page)', santhwanam_locked: 0, order: 6 },
      { slug: 'savings-deposit-application', title: 'Savings Deposit Account Opening Form', category: 'deposit', category_tag: 'Category 2 — Deposit Application', form_code: 'WDPCS-DP-01', desc: 'Official application to open a Member Savings Deposit (SB) account with passbook and nomination.', tags: 'savings deposit sb', file: 'assets/downloads/savings-deposit-application.pdf', size: 185000, page_info: 'PDF (2 Pages)', santhwanam_locked: 0, order: 7 },
      { slug: 'recurring-deposit-application', title: 'Recurring Deposit (RD) Application', category: 'deposit', category_tag: 'Category 2 — Deposit Application', form_code: 'WDPCS-DP-02', desc: 'Official form for opening a Recurring Deposit account with monthly thrift from ₹100 (12-120 months).', tags: 'recurring deposit rd', file: 'assets/downloads/recurring-deposit-application.pdf', size: 210000, page_info: 'PDF (2 Pages)', santhwanam_locked: 0, order: 8 },
      { slug: 'fixed-deposit-application', title: 'Fixed Deposit Application (ഫിക്സഡ് ഡെപ്പോസിറ്റ്)', category: 'deposit', category_tag: 'Category 2 — Deposit Application', form_code: 'WDPCS-DP-03', desc: 'Prescribed application for placing term deposits with nominee designation and payout instructions.', tags: 'fixed deposit fd', file: 'assets/downloads/fixed-deposit-application.pdf', size: 276000, page_info: 'PDF (1 Page)', santhwanam_locked: 0, order: 9 },
      { slug: 'santhwanam-application', title: 'Santhwanam Welfare Scheme Application Form (സാന്ത്വനം ക്ഷേമപദ്ധതി - അംഗത്വ ഫോറം)', category: 'santhwanam', category_tag: 'Welfare Scheme – Santhwanam', form_code: 'WDPCS-SW-01', desc: 'For enrolment in the Santhwanam Welfare Scheme.', tags: 'santhwanam enrolment welfare scheme', file: 'assets/downloads/santhwanam-application-form.pdf', size: 3000000, page_info: 'PDF (1 Page, Malayalam)', santhwanam_locked: 1, order: 10 },
      { slug: 'santhwanam-treatment-aid', title: 'Santhwanam Request for Treatment Aid (സാന്ത്വനം ചികിത്സാ ആനുകൂല്യ അപേക്ഷ)', category: 'santhwanam', category_tag: 'Welfare Scheme – Santhwanam', form_code: 'WDPCS-SW-02', desc: 'For requesting eligible medical treatment assistance under the Santhwanam Welfare Scheme. (No separate application form is required for death benefit claims.)', tags: 'santhwanam treatment aid claim', file: 'assets/downloads/santhwanam-claim-request-form.pdf', size: 134000, page_info: 'PDF (1 Page, Malayalam)', santhwanam_locked: 1, order: 11 },
      { slug: 'a-class-membership-form', title: 'A-Class Membership Application', category: 'other', category_tag: 'Category 4 — Membership & Welfare', form_code: 'WDPCS-MEM-01', desc: 'Prescribed admission form for regular police personnel applying for A-Class voting membership.', tags: 'membership a class admission', file: 'assets/downloads/a-class-membership-form.pdf', size: 190000, page_info: 'PDF (2 Pages)', santhwanam_locked: 0, order: 12 },
      { slug: 'room-dormitory-reservation-form', title: 'Society Room & Dormitory Reservation Request', category: 'other', category_tag: 'Category 5 — Society Facilities', form_code: 'WDPCS-FAC-01', desc: 'Requisition form for advance booking of AC/Non-AC rooms and dormitory beds at Kalpetta North.', tags: 'rooms dormitory booking accommodation', file: 'assets/downloads/room-dormitory-reservation-form.pdf', size: 145000, page_info: 'PDF (1 Page)', santhwanam_locked: 0, order: 13 }
    ];
    const insertDoc = db.prepare(`
      INSERT INTO documents
        (slug, title, category, category_tag, form_code, version_number, description, tags, file_path, original_filename, file_size, page_info, is_santhwanam_locked, display_order, workflow_status)
      VALUES (?, ?, ?, ?, ?, '1.0', ?, ?, ?, ?, ?, ?, ?, ?, 'Published')
    `);
    for (const d of seedDocs) {
      insertDoc.run(d.slug, d.title, d.category, d.category_tag, d.form_code, d.desc, d.tags, d.file, `${d.slug}.pdf`, d.size, d.page_info, d.santhwanam_locked, d.order);
    }
  }

  // 10. Seed FAQs (6 categories)
  const faqsCount = db.prepare(`SELECT COUNT(*) AS cnt FROM faqs`).get().cnt;
  if (faqsCount === 0) {
    const seedFaqs = [
      { category: 'general', question: 'Who is eligible to become a member of the Wayanad District Police Co-operative Society?', answer: '<p>Employees of the Kerala Police Department working or residing within Wayanad District are eligible for A-Class membership as per society bye-laws.</p>', order: 1 },
      { category: 'deposits', question: 'Are loan facilities available against Fixed Deposits and Recurring Deposits?', answer: '<p>Yes. Members can avail a Deposit Loan up to <strong>80% to 90%</strong> of Fixed Deposit value (and up to 75% of paid-up Recurring Deposit balance) without breaking their deposit.</p>', order: 2 },
      { category: 'loans', question: 'What is the maximum limit and interest rate for a Medium Term Loan?', answer: '<p>Medium Term Loans are available up to <strong>₹20,00,000.00</strong> at <strong>10% p.a.</strong> with EMI repayment up to 120 months, subject to salary recovery capacity and sureties.</p>', order: 3 },
      { category: 'docs', question: 'Where can I obtain official loan and deposit application forms?', answer: '<p>All prescribed official PDF forms can be downloaded directly from the <a href="downloads.html">Downloads Library</a> or collected from the Society Office in Kalpetta North.</p>', order: 4 },
      { category: 'rooms', question: 'How can police personnel reserve Society Rooms or Dormitory accommodation?', answer: '<p>Reservations are processed through the Society Office during working hours (10:00 AM to 5:00 PM) at <strong>04936 205940</strong> or <strong>8301995940</strong>.</p>', order: 5 },
      { category: 'santhwanam', question: 'What is the lifetime contribution for enrolling in the Santhwanam Welfare Scheme?', answer: '<p>Participation requires a one-time lifetime premium of <strong>₹500</strong>, administered directly through the Society Office.</p>', order: 6 }
    ];
    const insertFaq = db.prepare(`
      INSERT INTO faqs (category, question, answer_html, display_order, workflow_status)
      VALUES (?, ?, ?, ?, 'Published')
    `);
    for (const f of seedFaqs) {
      insertFaq.run(f.category, f.question, f.answer, f.order);
    }
  }

  // 11. Seed Santhwanam Welfare Scheme Content (strictly excludes sub-rules)
  const santhSections = [
    {
      section_key: 'santhwanam_overview',
      section_title: 'Scheme Overview & Tagline',
      payload: {
        title: 'Santhwanam Welfare Scheme',
        tagline: 'A Helping Hand in Times of Need.',
        introParagraphs: [
          'Santhwanam is a welfare initiative operated by Wayanad District Police Co-operative Society Ltd. No. W 208 to extend financial support to its members and their families during difficult times.',
          'The scheme provides financial assistance towards eligible medical treatment expenses and financial support to the eligible family members or claimants in the event of a member\'s death.',
          'Designed around the values of mutual support, compassion and collective responsibility, Santhwanam reflects the society\'s commitment to the welfare and financial security of its members.'
        ],
        lifetimePremiumAmount: '₹500',
        lifetimePremiumNote: 'A one-time lifetime premium of ₹500 for participation in the Santhwanam Welfare Scheme.'
      }
    },
    {
      section_key: 'santhwanam_benefits',
      section_title: 'Medical Treatment Assistance & Death Benefit',
      payload: {
        medicalTitle: 'Medical Treatment Assistance',
        medicalDescription: 'Santhwanam provides financial assistance to eligible enrolled members who require medical treatment for qualifying illnesses or medical conditions, subject to the applicable scheme provisions.',
        medicalChecklist: [
          'Prescribed Santhwanam Request for Treatment Aid form submitted through the Society',
          'Supporting hospital bills, discharge summary, and medical certification where applicable',
          'Enrolled Santhwanam membership verification'
        ],
        deathTitle: 'Death Benefit',
        deathDescription: 'In the unfortunate event of the death of an enrolled member, Santhwanam provides financial assistance to eligible family members or claimants in accordance with the applicable scheme provisions.',
        deathChecklist: [
          'Official intimation and claim submission by eligible family member / nominee / claimant through the Society',
          'Verified death certificate and claimant identification documents',
          'No separate application form is required for death benefit claims'
        ]
      }
    },
    {
      section_key: 'santhwanam_access',
      section_title: 'How to Access the Scheme & Important Notice',
      payload: {
        steps: [
          { step: 'Step 1 – Enrolment', description: 'Complete the Santhwanam Welfare Scheme application and pay the applicable one-time lifetime premium.' },
          { step: 'Step 2 – Membership', description: 'Complete the enrolment process through the society, subject to applicable scheme requirements.' },
          { step: 'Step 3 – Request Assistance', description: 'Eligible members or claimants can submit the appropriate request for medical treatment assistance or death benefit through the society.' }
        ],
        importantNotice: 'All enrolments, one-time lifetime premium remittances (₹500), and treatment aid / death claim submissions are processed directly through the Society office during official working hours. Online enrolment, online payment, and automated claim approval are not offered through the website.'
      }
    }
  ];

  const insertSanth = db.prepare(`
    INSERT OR IGNORE INTO santhwanam_content
      (section_key, section_title, published_payload, draft_payload, workflow_status, version_number)
    VALUES (?, ?, ?, ?, 'Published', 1)
  `);
  for (const s of santhSections) {
    const json = JSON.stringify(s.payload);
    insertSanth.run(s.section_key, s.section_title, json, json);
  }

  return createdAdminInfo;
}

module.exports = {
  PERMISSIONS,
  ROLE_DEFINITIONS,
  seedBaseData
};


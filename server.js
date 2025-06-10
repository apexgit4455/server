// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 5000;

// --- Nodemailer Transporter Setup ---
let transporter;
const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT, 10);
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const emailFrom = process.env.EMAIL_FROM_ADDRESS || `"${process.env.EMAIL_FROM_NAME || 'Apex Admissions'}" <${smtpUser}>`;

// --- Admin Notification Email Address ---
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "kishor002912@gmail.com";

if (smtpHost && smtpPort && smtpUser && smtpPass) {
  const transporterOptions = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  };
  transporter = nodemailer.createTransport(transporterOptions);
  transporter.verify((error, success) => {
    if (error) {
        console.error('Nodemailer SMTP Configuration Error:', error);
    } else {
        console.log('Nodemailer SMTP server is ready to take our messages');
    }
  });
} else {
  console.error('FATAL: SMTP credentials (HOST, PORT, USER, PASS) are not set in .env. Email functionality will fail.');
}

// --- Razorpay Instance Setup ---
let razorpayInstance;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const applicationFee = parseInt(process.env.APPLICATION_FEE, 10);

if (razorpayKeyId && razorpayKeySecret && !isNaN(applicationFee) && applicationFee > 0) {
  razorpayInstance = new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret });
  console.log('Razorpay instance initialized.');
} else {
  console.error('FATAL: Razorpay credentials or Application Fee not set in .env. Payment functionality will fail.');
}

// --- In-memory OTP Storage ---
const otpStore = {}; // { "email@example.com": { otp: "123456", expiresAt: timestamp, attempts: 0 } }

// --- Middleware ---
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'https://admission.apex.ac.in'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Helper Functions ---
function generateOTP() { 
    return Math.floor(100000 + Math.random() * 900000).toString(); 
}
const MAX_OTP_ATTEMPTS = 5;

// Function to create a formatted HTML email for admin
function createAdminNotificationEmail(data) {
    const styles = `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9; }
      h2 { color: #0A2463; border-bottom: 2px solid #0A2463; padding-bottom: 10px; }
      h3 { color: #1E478B; margin-top: 25px; border-bottom: 1px solid #eee; padding-bottom: 5px;}
      .detail-grid { display: grid; grid-template-columns: 150px 1fr; gap: 8px 15px; margin-bottom: 15px; }
      .label { font-weight: 600; color: #555; }
      .value { word-break: break-word; }
      .doc-links a { display: inline-block; margin: 5px 10px 5px 0; padding: 8px 12px; background-color: #0A2463; color: #fff; text-decoration: none; border-radius: 5px; }
      .footer { margin-top: 30px; text-align: center; font-size: 0.9em; color: #777; }
    `;

    const Detail = (label, value) => value ? `<div class="detail-grid"><span class="label">${label}:</span><span class="value">${value}</span></div>` : '';
    const DocLink = (label, url) => url ? `<a href="${url}" target="_blank">${label}</a>` : '';

    return `
      <html>
        <head><style>${styles}</style></head>
        <body>
          <div class="container">
            <h2>New Admission Application Received</h2>
            <p>A new application has been submitted on the portal. Details are as follows:</p>
            
            <h3>Applicant Details</h3>
            ${Detail('Full Name', data.fullName)}
            ${Detail('Email', data.email)}
            ${Detail('Mobile', data.mobile)}
            ${Detail('Address', `${data.address}, ${data.city}, ${data.state} - ${data.zipcode}`)}
            ${Detail('Gender', data.gender)}
            ${Detail('Category', data.category)}
            ${Detail('Aadhaar No.', data.aadhaarNumber)}

            <h3>Parent's Details</h3>
            <p><strong>Father:</strong></p>
            ${Detail('Name', data.parents?.father?.name)}
            ${Detail('Mobile', data.parents?.father?.mobile)}
            ${Detail('Profession', data.parents?.father?.profession)}
            
            <p><strong>Mother:</strong></p>
            ${Detail('Name', data.parents?.mother?.name)}
            ${Detail('Mobile', data.parents?.mother?.mobile)}
            ${Detail('Profession', data.parents?.mother?.profession)}
            
            <h3>Education Details</h3>
            <p><strong>Class X:</strong></p>
            ${Detail('Board', data.education?.class10?.board)}
            ${Detail('School', data.education?.class10?.schoolName)}
            ${Detail('Percentage', data.education?.class10?.percentage + '%')}
            
            <p><strong>Class XII:</strong></p>
            ${Detail('Board', data.education?.class12?.board)}
            ${Detail('School', data.education?.class12?.schoolName)}
            ${Detail('Percentage', data.education?.class12?.percentage + '%')}

            <h3>Uploaded Documents</h3>
            <div class="doc-links">
              ${DocLink('View Photo', data.uploads?.passportPhoto)}
              ${DocLink('View Aadhaar', data.uploads?.adharCard)}
              ${DocLink('View 10th Marksheet', data.uploads?.marksheet10)}
              ${DocLink('View 12th Marksheet', data.uploads?.marksheet12)}
            </div>
            
            <div class="footer">
              <p>This is an automated notification from the Apex Admission Portal.</p>
            </div>
          </div>
        </body>
      </html>
    `;
}

// --- API Endpoints ---

// 1. Send OTP Email Endpoint
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid email address is required.' });
  }
  if (!transporter) {
    console.error('Nodemailer transporter not initialized. Cannot send OTP.');
    return res.status(500).json({ message: 'Email service configuration error.' });
  }

  const otp = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  otpStore[email.toLowerCase()] = { otp, expiresAt, attempts: 0 };
  console.log(`Generated OTP for ${email}: ${otp}`);

  const mailOptions = {
    from: emailFrom,
    to: email,
    subject: 'Your Apex Admission Portal OTP',
    html: `<p>Your One-Time Password (OTP) is: <b>${otp}</b>. It is valid for 10 minutes.</p>`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`OTP email sent to ${email}: ${info.messageId}`);
    return res.status(200).json({ message: `OTP sent to ${email}.` });
  } catch (error) {
    console.error(`Error sending OTP to ${email}:`, error);
    return res.status(500).json({ message: 'Failed to send OTP email.' });
  }
});

// 2. Verify OTP Endpoint
app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ verified: false, message: 'Email and OTP are required.' });
  }
  
  const lowerEmail = email.toLowerCase();
  const storedOtpData = otpStore[lowerEmail];

  if (!storedOtpData) {
    return res.status(400).json({ verified: false, message: 'OTP not found or has expired. Please request a new one.' });
  }
  if (Date.now() > storedOtpData.expiresAt) {
    delete otpStore[lowerEmail];
    return res.status(400).json({ verified: false, message: 'OTP expired. Please request a new one.' });
  }
  if (storedOtpData.attempts >= MAX_OTP_ATTEMPTS) {
    delete otpStore[lowerEmail];
    return res.status(400).json({ verified: false, message: 'Maximum verification attempts reached. Please request a new OTP.' });
  }
  if (storedOtpData.otp === otp) {
    delete otpStore[lowerEmail];
    return res.status(200).json({ verified: true, message: 'Email OTP verified successfully.' });
  } else {
    otpStore[lowerEmail].attempts += 1;
    return res.status(400).json({ verified: false, message: 'Invalid OTP.' });
  }
});

// 3. Admin Notification Endpoint
app.post('/api/notify-admin', async (req, res) => {
    const applicationData = req.body;

    if (!applicationData || !applicationData.email) {
        return res.status(400).json({ message: 'Application data is required.' });
    }
    if (!transporter) {
        console.error('Admin notification failed: Nodemailer transporter not initialized.');
        // We don't want to block the user flow, so we still return a success-like status.
        return res.status(200).json({ message: 'Email service is not configured on the server.' });
    }

    const mailOptions = {
        from: emailFrom,
        to: ADMIN_EMAIL,
        subject: `New Application Received from ${applicationData.fullName}`,
        html: createAdminNotificationEmail(applicationData),
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Admin notification email sent to ${ADMIN_EMAIL} for applicant ${applicationData.fullName}`);
        res.status(200).json({ message: 'Admin notified successfully.' });
    } catch (error) {
        console.error(`Error sending admin notification email:`, error);
        // We send a 200 OK response even on failure to not block the frontend flow.
        // The error is logged on the server for debugging.
        res.status(200).json({ message: 'Admin notification failed but proceeding.', error: error.message });
    }
});

// 4. Create Razorpay Order Endpoint
app.post('/api/create-order', async (req, res) => {
  if (!razorpayInstance) {
    return res.status(500).json({ message: 'Payment gateway not configured.' });
  }

  const compactTimestamp = Date.now().toString(36);
  let generatedReceipt = `rcpt_app_${compactTimestamp}`;
  const appId = req.body.receiptNotes?.applicationId;
  if (appId && typeof appId === 'string') {
    generatedReceipt += `_${appId.substring(0, 10)}`;
  }
  
  const options = {
    amount: applicationFee,
    currency: 'INR',
    receipt: generatedReceipt.substring(0, 40),
    notes: req.body.receiptNotes
  };

  try {
    const order = await razorpayInstance.orders.create(options);
    if (!order) {
      return res.status(500).json({ message: 'Error creating Razorpay order.' });
    }
    res.json({ ...order, key_id: razorpayKeyId });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(error.statusCode || 500).json({ message: 'Could not create payment order.', error: error.message });
  }
});

// 5. Verify Payment Signature Endpoint
app.post('/api/payment-verification', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: 'Missing payment details for verification.' });
  }
  if (!secret) {
    console.error("FATAL: RAZORPAY_KEY_SECRET not set for payment verification.");
    return res.status(500).json({ success: false, message: "Server configuration error for payment verification." });
  }

  const digest = crypto.createHmac('sha256', secret)
                       .update(`${razorpay_order_id}|${razorpay_payment_id}`)
                       .digest('hex');

  if (digest === razorpay_signature) {
    console.log('Payment verification successful for order:', razorpay_order_id);
    res.json({
      success: true,
      message: 'Payment verified successfully.'
    });
  } else {
    console.warn('Payment verification failed for order:', razorpay_order_id);
    res.status(400).json({ success: false, message: 'Payment verification failed. Signature mismatch.' });
  }
});

// --- Health Check ---
app.get('/health', (req, res) => {
  const nodemailerStatus = transporter ? 'UP' : 'DOWN (Not configured)';
  const razorpayStatus = razorpayInstance ? 'UP' : 'DOWN (Not configured)';
  res.status(200).json({ 
    status: 'UP', 
    message: 'OTP & Payment service is running.',
    services: {
        nodemailer: nodemailerStatus,
        razorpay: razorpayStatus
    }
  });
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
  if (!transporter) {
    console.warn('WARNING: Nodemailer SMTP transporter not initialized. Email functionality will fail.');
  } else {
    console.log(`Email service configured. Admin notifications will be sent to: ${ADMIN_EMAIL}`);
  }
  if (!razorpayInstance) {
    console.warn('WARNING: Razorpay instance not initialized. Payment will fail.');
  } else {
    console.log(`Razorpay payment gateway configured. Application Fee: ₹${applicationFee / 100}.`);
  }
});

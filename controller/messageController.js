const supabase = require('./../util/supabaseClient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');
const nodemailer = require('nodemailer');

// Prefer SendGrid Web API when `SENDGRID_API_KEY` is provided.
// Fall back to SMTP (or jsonTransport) when Web API is not available.
let transporter;
let sgMail = null;
if (process.env.SENDGRID_API_KEY) {
  try {
    sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  } catch (e) {
    console.error(
      'Could not load @sendgrid/mail. Please run `npm i @sendgrid/mail`',
      e
    );
    sgMail = null;
  }
}

// Only create an SMTP transporter if SendGrid Web API is not used
if (!sgMail) {
  if (process.env.SMTP_URL) {
    transporter = nodemailer.createTransport({ url: process.env.SMTP_URL });
  } else {
    // No SMTP provider configured; create a jsonTransport to avoid real sends in dev
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
}

exports.sendMessage = catchAsync(async (req, res, next) => {
  const { sender_email, receiver_id, message } = req.body;

  if (!sender_email || !receiver_id || !message) {
    return next(new AppError('Please provide all required fields', 400));
  }

  // Lookup receiver
  const { data: receiver, error: userError } = await supabase
    .from('users')
    .select('email, name')
    .eq('id', receiver_id)
    .maybeSingle();

  if (userError || !receiver) {
    return next(new AppError('Receiver not found', 404));
  }

  // Insert message into messages table
  const { data: messageData, error: messageError } = await supabase
    .from('messages')
    .insert({ sender_email, receiver_id, message })
    .select()
    .single();

  if (messageError) {
    console.error('Messages insert error:', messageError);
    return next(new AppError('Could not save message', 500));
  }

  // Send notification email (best-effort)
  const htmlBody = `
    <h2>You have a new message!</h2>
    <p><strong>From:</strong> ${sender_email}</p>
    <p><strong>Message:</strong></p>
    <p>${message}</p>
    <br>
  `;

  // If SendGrid Web API is available, use it (preferred).
  if (sgMail) {
    const msg = {
      to: receiver.email,
      from:
        process.env.EMAIL_FROM ||
        process.env.EMAIL_USER ||
        'no-reply@localhost',
      replyTo: sender_email,
      subject: `New message from ${sender_email}`,
      html: htmlBody
    };

    try {
      await sgMail.send(msg);
      return res.status(201).json({
        status: 'success',
        message: 'Message sent successfully',
        data: messageData
      });
    } catch (sgErr) {
      console.error(
        'SendGrid API sending failed:',
        sgErr && sgErr.response ? sgErr.response.body : sgErr
      );
      return res.status(201).json({
        status: 'success',
        message: 'Message saved but email notification failed',
        data: messageData
      });
    }
  }

  // Otherwise fall back to nodemailer SMTP/jsonTransport
  // Use sender_email as "from" (may be rejected by some providers).
  const mailOptions = {
    from: sender_email,
    to: receiver.email,
    subject: `New message from ${sender_email}`,
    replyTo: sender_email,
    html: htmlBody
  };

  try {
    await transporter.sendMail(mailOptions);
    return res.status(201).json({
      status: 'success',
      message: 'Message sent successfully',
      data: messageData
    });
  } catch (emailError) {
    console.error('Primary email sending failed:', emailError);

    // Retry with verified app sender if provided to improve deliverability.
    const appFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    if (appFrom) {
      const fallbackOptions = Object.assign({}, mailOptions, {
        from: appFrom,
        // ensure replies go to the original sender
        replyTo: sender_email
      });

      try {
        await transporter.sendMail(fallbackOptions);
        return res.status(201).json({
          status: 'success',
          message: 'Message saved and email sent via fallback sender',
          data: messageData
        });
      } catch (fallbackError) {
        console.error('Fallback email sending also failed:', fallbackError);
        return res.status(201).json({
          status: 'success',
          message: 'Message saved but email notification failed',
          data: messageData
        });
      }
    }

    // No fallback sender configured — return success but notify caller.
    return res.status(201).json({
      status: 'success',
      message: 'Message saved but email notification failed',
      data: messageData
    });
  }
});

exports.getMessages = catchAsync(async (req, res, next) => {
  const receiver_id = req.user && req.user.id;
  if (!receiver_id)
    return next(new AppError('User authentication required', 401));

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('receiver_id', receiver_id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Messages fetch error:', error);
    return next(new AppError('Could not fetch messages', 500));
  }

  res.status(200).json({ status: 'success', results: data.length, data });
});

module.exports = exports;

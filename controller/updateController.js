const supabase = require('./../util/supabaseClient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');
const path = require('path');
const userController = require('./userController');

// Helper: normalize CSV or array inputs to JS array
const normalizeArray = val => {
  if (!val && val !== 0) return null;
  if (Array.isArray(val)) return val;
  if (typeof val === 'string')
    return val
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  return null;
};

// Helper: upload file buffer to uploads bucket and return public url
const uploadFile = async (file, folder) => {
  if (!file) return null;
  const bucketName = 'uploads';
  const ext = path.extname(file.originalname) || '';
  const filename = `${folder}/${Date.now()}-${file.originalname}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (uploadError) {
    throw new AppError(uploadError.message || 'Failed to upload file', 500);
  }

  const { data: urlData } = await supabase.storage
    .from(bucketName)
    .getPublicUrl(filename);
  return urlData && urlData.publicUrl ? urlData.publicUrl : null;
};

// -----------------------
// Update handlers
// -----------------------

exports.updateAbout = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  if (!req.user || !req.user.id)
    return next(new AppError('User authentication required', 401));

  // fetch existing
  const { data: existing, error: selErr } = await supabase
    .from('about')
    .select('*')
    .eq('user_id', id)
    .maybeSingle();
  if (selErr) {
    console.error('About select error:', selErr);
    return next(new AppError('Could not query about record', 500));
  }
  if (!existing) return next(new AppError('About record not found', 404));
  if (existing.user_id !== req.user.id)
    return next(new AppError('Forbidden', 403));

  const { name, description } = req.body;

  const payload = {};
  if (name) payload.name = String(name).trim();
  if (description) payload.description = description;

  // files: resume and profileImage
  if (req.files && req.files.resume && req.files.resume[0]) {
    const url = await uploadFile(
      req.files.resume[0],
      `resume/about-${req.user.id}`
    );
    payload.resume_url = url;
  }
  if (req.files && req.files.profileImage && req.files.profileImage[0]) {
    const url = await uploadFile(
      req.files.profileImage[0],
      `image/about-${req.user.id}`
    );
    payload.profile_image = url;
  }

  if (Object.keys(payload).length === 0)
    return res
      .status(200)
      .json({ status: 'success', message: 'Nothing to update' });

  const { data, error } = await supabase
    .from('about')
    .update(payload)
    .eq('user_id', id)
    .select()
    .single();
  if (error) {
    console.error('About update error:', error);
    return next(new AppError(error.message || 'Could not update about', 500));
  }

  res.status(200).json({ status: 'success', data });
});

exports.updateBlog = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  if (!req.user || !req.user.id)
    return next(new AppError('User authentication required', 401));

  const { data: existing, error: selErr } = await supabase
    .from('blogs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (selErr) {
    console.error('Blogs select error:', selErr);
    return next(new AppError('Could not query blog record', 500));
  }
  if (!existing) return next(new AppError('Blog not found', 404));
  if (existing.user_id !== req.user.id)
    return next(new AppError('Forbidden', 403));

  const {
    title,
    slug,
    excerpt,
    content,
    author,
    tags,
    published,
    published_at
  } = req.body;

  const payload = {};
  if (title) payload.title = String(title).trim();
  if (slug) payload.slug = String(slug).trim();
  if (excerpt !== undefined) payload.excerpt = excerpt || null;
  if (content !== undefined) payload.content = content || null;
  if (author !== undefined) payload.author = author || null;
  const tagsArr = normalizeArray(tags);
  if (tagsArr) payload.tags = tagsArr;
  if (published !== undefined)
    payload.published =
      published === true ||
      published === 'true' ||
      published === '1' ||
      published === 1;
  if (published_at !== undefined) payload.published_at = published_at || null;

  // cover image
  let imageFile = null;
  if (req.files && req.files.coverImage && req.files.coverImage[0])
    imageFile = req.files.coverImage[0];
  else if (req.file) imageFile = req.file;
  if (imageFile) {
    payload.cover_image = await uploadFile(
      imageFile,
      `blogs/cover-${req.user.id}`
    );
  }

  if (Object.keys(payload).length === 0)
    return res
      .status(200)
      .json({ status: 'success', message: 'Nothing to update' });

  const { data, error } = await supabase
    .from('blogs')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Blogs update error:', error);
    return next(new AppError(error.message || 'Could not update blog', 500));
  }

  res.status(200).json({ status: 'success', data });
});

exports.updateExperience = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  if (!req.user || !req.user.id)
    return next(new AppError('User authentication required', 401));

  const { data: existing, error: selErr } = await supabase
    .from('experience')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (selErr) {
    console.error('Experience select error:', selErr);
    return next(new AppError('Could not query experience record', 500));
  }
  if (!existing) return next(new AppError('Experience not found', 404));
  if (existing.user_id !== req.user.id)
    return next(new AppError('Forbidden', 403));

  const {
    company,
    position,
    location,
    employment_type,
    start_date,
    end_date,
    is_current,
    description,
    responsibilities,
    technologies
  } = req.body;

  const payload = {};
  if (company !== undefined) payload.company = company || null;
  if (position !== undefined) payload.position = position || null;
  if (location !== undefined) payload.location = location || null;
  if (employment_type !== undefined)
    payload.employment_type = employment_type || null;
  if (start_date !== undefined) payload.start_date = start_date || null;
  if (end_date !== undefined) payload.end_date = end_date || null;
  if (description !== undefined) payload.description = description || null;
  if (is_current !== undefined)
    payload.is_current =
      is_current === true ||
      is_current === 'true' ||
      is_current === '1' ||
      is_current === 1;

  const resp = normalizeArray(responsibilities);
  if (resp) payload.responsibilities = resp;
  const tech = normalizeArray(technologies);
  if (tech) payload.technologies = tech;

  // company logo: allow file via profileImage or text URL via company_logo
  if (req.files && req.files.profileImage && req.files.profileImage[0]) {
    payload.company_logo = await uploadFile(
      req.files.profileImage[0],
      `experience/logo-${req.user.id}`
    );
  } else if (req.body.company_logo) {
    payload.company_logo = req.body.company_logo;
  }

  if (Object.keys(payload).length === 0)
    return res
      .status(200)
      .json({ status: 'success', message: 'Nothing to update' });

  const { data, error } = await supabase
    .from('experience')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Experience update error:', error);
    return next(
      new AppError(error.message || 'Could not update experience', 500)
    );
  }

  res.status(200).json({ status: 'success', data });
});

exports.updateProject = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  if (!req.user || !req.user.id)
    return next(new AppError('User authentication required', 401));

  const { data: existing, error: selErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (selErr) {
    console.error('Projects select error:', selErr);
    return next(new AppError('Could not query project record', 500));
  }
  if (!existing) return next(new AppError('Project not found', 404));
  if (existing.user_id !== req.user.id)
    return next(new AppError('Forbidden', 403));

  const {
    title,
    description,
    long_description,
    demo_url,
    github_url,
    technologies,
    category,
    featured,
    order_index
  } = req.body;

  const payload = {};
  if (title !== undefined) payload.title = title || null;
  if (description !== undefined) payload.description = description || null;
  if (long_description !== undefined)
    payload.long_description = long_description || null;
  if (demo_url !== undefined) payload.demo_url = demo_url || null;
  if (github_url !== undefined) payload.github_url = github_url || null;
  const techs = normalizeArray(technologies);
  if (techs) payload.technologies = techs;
  if (category !== undefined) payload.category = category || null;
  if (featured !== undefined)
    payload.featured =
      featured === true ||
      featured === 'true' ||
      featured === '1' ||
      featured === 1;
  if (order_index !== undefined) {
    const oi = Number(order_index);
    if (!Number.isNaN(oi)) payload.order_index = oi;
  }

  // project image
  if (req.files && req.files.projectImage && req.files.projectImage[0]) {
    payload.image_url = await uploadFile(
      req.files.projectImage[0],
      `projects/image-${req.user.id}`
    );
  }

  if (Object.keys(payload).length === 0)
    return res
      .status(200)
      .json({ status: 'success', message: 'Nothing to update' });

  const { data, error } = await supabase
    .from('projects')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Projects update error:', error);
    return next(new AppError(error.message || 'Could not update project', 500));
  }

  res.status(200).json({ status: 'success', data });
});

exports.updateService = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  if (!req.user || !req.user.id)
    return next(new AppError('User authentication required', 401));

  const { data: existing, error: selErr } = await supabase
    .from('services')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (selErr) {
    console.error('Services select error:', selErr);
    return next(new AppError('Could not query service record', 500));
  }
  if (!existing) return next(new AppError('Service not found', 404));
  if (existing.user_id !== req.user.id)
    return next(new AppError('Forbidden', 403));

  const { title, description, features, price_range, active, order_index } =
    req.body;
  const payload = {};
  if (title !== undefined) payload.title = title || null;
  if (description !== undefined) payload.description = description || null;
  const featuresArr = normalizeArray(features);
  if (featuresArr) payload.features = featuresArr;
  if (price_range !== undefined) payload.price_range = price_range || null;
  if (active !== undefined)
    payload.active =
      active === true || active === 'true' || active === '1' || active === 1;
  if (order_index !== undefined) {
    const oi = Number(order_index);
    if (!Number.isNaN(oi)) payload.order_index = oi;
  }

  if (Object.keys(payload).length === 0)
    return res
      .status(200)
      .json({ status: 'success', message: 'Nothing to update' });

  const { data, error } = await supabase
    .from('services')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Services update error:', error);
    return next(new AppError(error.message || 'Could not update service', 500));
  }

  res.status(200).json({ status: 'success', data });
});

exports.updateSkill = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  if (!req.user || !req.user.id)
    return next(new AppError('User authentication required', 401));

  const { data: existing, error: selErr } = await supabase
    .from('skills')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (selErr) {
    console.error('Skills select error:', selErr);
    return next(new AppError('Could not query skill record', 500));
  }
  if (!existing) return next(new AppError('Skill not found', 404));
  if (existing.user_id !== req.user.id)
    return next(new AppError('Forbidden', 403));

  const { name, category, proficiency, order_index } = req.body;
  const payload = {};
  if (name !== undefined) {
    if (!name || String(name).trim() === '')
      return next(new AppError('Name is required', 400));
    payload.name = String(name).trim();
  }
  if (category !== undefined) payload.category = category || null;
  if (proficiency !== undefined && proficiency !== '') {
    const p = Number(proficiency);
    if (Number.isNaN(p) || !Number.isInteger(p) || p < 0 || p > 100)
      return next(new AppError('Proficiency must be integer 0..100', 400));
    payload.proficiency = p;
  }
  if (order_index !== undefined) {
    const oi = Number(order_index);
    if (Number.isNaN(oi))
      return next(new AppError('order_index must be a number', 400));
    payload.order_index = oi;
  }

  if (Object.keys(payload).length === 0)
    return res
      .status(200)
      .json({ status: 'success', message: 'Nothing to update' });

  const { data, error } = await supabase
    .from('skills')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Skills update error:', error);
    return next(new AppError(error.message || 'Could not update skill', 500));
  }

  res.status(200).json({ status: 'success', data });
});

module.exports = exports;

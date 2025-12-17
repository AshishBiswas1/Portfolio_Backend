const supabase = require('./../util/supabaseClient');
const AppError = require('./../util/appError');
const catchAsync = require('./../util/catchAsync');
const multer = require('multer');
const path = require('path');

exports.getMe = catchAsync(async (req, res, next) => {
  const id = req.user.id;

  const { data, error } = await supabase
    .from('about')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (error) {
    return next(new AppError('No user found', 400));
  }

  res.status(200).json({
    status: 'success',
    data
  });
});

exports.updateMe = catchAsync(async (req, res, next) => {
  const id = req.user.id;
  const name = req.body.name;

  if (!name) {
    return next(new AppError('Please provide the name to update', 400));
  }

  // Try to find existing about row for this user
  const { data: existing, error: selectError } = await supabase
    .from('about')
    .select('id')
    .eq('user_id', id)
    .maybeSingle();

  if (selectError) {
    console.error('About select error:', selectError);
    return next(
      new AppError(selectError.message || 'Could not query about table.', 500)
    );
  }

  if (existing && existing.id) {
    // update
    const { data, error } = await supabase
      .from('about')
      .update({ name })
      .eq('user_id', id)
      .select()
      .single();

    if (error) {
      console.error('About update error:', error);
      return next(
        new AppError(error.message || 'Could not update about details.', 500)
      );
    }

    return res.status(200).json({ status: 'success', data });
  }

  // insert
  const { data: inserted, error: insertError } = await supabase
    .from('about')
    .insert({ user_id: id, name })
    .select()
    .single();

  if (insertError) {
    console.error('About insert error:', insertError);
    return next(
      new AppError(
        insertError.message || 'Could not create about details.',
        500
      )
    );
  }

  res.status(200).json({ status: 'success', data: inserted });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  const { error } = await supabase
    .from('users')
    .update({ isactive: false })
    .eq('id', req.user.id)
    .select();

  if (error) {
    return next(
      new AppError(error.message || 'Could not delete user account', 400)
    );
  }

  res.status(204).json({
    status: 'success'
  });
});

exports.about = catchAsync(async (req, res, next) => {
  const { name, description, designation } = req.body;

  // Handle resume and profile image uploads separately
  let resumeUrl = null;
  let profileImageUrl = null;
  const userId = req.user && req.user.id ? req.user.id : 'anonymous';
  const bucketName = 'uploads';

  // Handle resume upload (if present in req.files.resume)
  if (req.files && req.files.resume && req.files.resume[0]) {
    const resumeFile = req.files.resume[0];
    const ext = path.extname(resumeFile.originalname) || '';
    const resumeFilename = `resume/user-${userId}-resume${ext}`;

    const { data: resumeUploadData, error: resumeUploadError } =
      await supabase.storage
        .from(bucketName)
        .upload(resumeFilename, resumeFile.buffer, {
          contentType: resumeFile.mimetype,
          upsert: true
        });

    if (resumeUploadError) {
      return next(
        new AppError(
          resumeUploadError.message ||
            `Failed to upload resume. Ensure bucket "${bucketName}" exists and is writable.`,
          500
        )
      );
    }

    const { data: resumeUrlData } = await supabase.storage
      .from(bucketName)
      .getPublicUrl(resumeFilename);

    resumeUrl = resumeUrlData.publicUrl;
  }

  // Handle profile image upload (if present in req.files.profileImage)
  if (req.files && req.files.profileImage && req.files.profileImage[0]) {
    const imageFile = req.files.profileImage[0];
    const ext = path.extname(imageFile.originalname) || '';
    const imageFilename = `image/user-${userId}${ext}`;

    const { data: imageUploadData, error: imageUploadError } =
      await supabase.storage
        .from(bucketName)
        .upload(imageFilename, imageFile.buffer, {
          contentType: imageFile.mimetype,
          upsert: true
        });

    if (imageUploadError) {
      return next(
        new AppError(
          imageUploadError.message ||
            `Failed to upload profile image. Ensure bucket "${bucketName}" exists and is writable.`,
          500
        )
      );
    }

    const { data: imageUrlData } = await supabase.storage
      .from(bucketName)
      .getPublicUrl(imageFilename);

    profileImageUrl = imageUrlData.publicUrl;
  }

  // Persist name/description, resume, and profile image to about table if user is authenticated
  if (req.user && req.user.id) {
    const id = req.user.id;
    const upsertPayload = {
      user_id: id
    };
    if (name) upsertPayload.name = name;
    if (description) upsertPayload.description = description;
    if (resumeUrl) upsertPayload.resume_url = resumeUrl;
    if (profileImageUrl) upsertPayload.profile_image = profileImageUrl;
    if (designation) upsertPayload.designation = designation;

    if (Object.keys(upsertPayload).length > 1) {
      // Find existing about row
      const { data: existingAbout, error: selectErr } = await supabase
        .from('about')
        .select('id')
        .eq('user_id', id)
        .maybeSingle();

      if (selectErr) {
        console.error('About select error:', selectErr);
        return next(
          new AppError(selectErr.message || 'Could not query about table.', 500)
        );
      }

      if (existingAbout && existingAbout.id) {
        // update
        const { data: updatedAbout, error: updateErr } = await supabase
          .from('about')
          .update(upsertPayload)
          .eq('user_id', id)
          .select()
          .single();

        if (updateErr) {
          console.error('About update error:', updateErr);
          return next(
            new AppError(
              updateErr.message || 'Could not update about profile.',
              500
            )
          );
        }

        return res.status(200).json({ status: 'success', data: updatedAbout });
      }

      // insert
      const { data: insertedAbout, error: insertErr } = await supabase
        .from('about')
        .insert(upsertPayload)
        .select()
        .single();

      if (insertErr) {
        console.error('About insert error:', insertErr);
        return next(
          new AppError(
            insertErr.message || 'Could not create about profile.',
            500
          )
        );
      }

      const { error } = await supabase
        .from('publish')
        .insert({ user_id: req.user.id });

      if (error) {
        return next(new AppError(error.message, 400));
      }

      return res.status(200).json({ status: 'success', data: insertedAbout });
    }
  }

  // If no user or nothing to update, return the upload info (if any) or a generic message
  const uploadInfo = {};
  if (resumeUrl) uploadInfo.resumeUrl = resumeUrl;
  if (profileImageUrl) uploadInfo.profileImageUrl = profileImageUrl;

  if (Object.keys(uploadInfo).length > 0) {
    return res.status(201).json({ status: 'success', ...uploadInfo });
  }

  res.status(200).json({ status: 'success', message: 'About info received' });
});

exports.experience = catchAsync(async (req, res, next) => {
  const {
    company,
    position = 'Student',
    location,
    employment_type,
    start_date,
    end_date,
    is_current,
    description,
    responsibilities,
    technologies
  } = req.body;

  if (!req.user || !req.user.id) {
    return next(new AppError('User authentication required', 401));
  }

  const experienceData = {
    user_id: req.user.id,
    position
  };

  // Add optional fields if provided
  if (company) experienceData.company = company;
  if (location) experienceData.location = location;
  if (employment_type) experienceData.employment_type = employment_type;
  if (start_date) experienceData.start_date = start_date;
  if (end_date) experienceData.end_date = end_date;
  if (description) experienceData.description = description;

  // Normalize boolean-like `is_current` values (accepts true/false or 'true'/'false')
  if (is_current !== undefined) {
    experienceData.is_current =
      is_current === true ||
      is_current === 'true' ||
      is_current === '1' ||
      is_current === 1;
  }

  // Helper: accept arrays or comma-separated strings for text[] fields
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

  const resp = normalizeArray(responsibilities);
  if (resp) experienceData.responsibilities = resp;

  const tech = normalizeArray(technologies);
  if (tech) experienceData.technologies = tech;

  // Accept company_logo (can be a URL or data URL). Store as text.
  if (company_logo) experienceData.company_logo = company_logo;

  const { data, error } = await supabase
    .from('experience')
    .insert(experienceData)
    .select()
    .single();

  if (error) {
    console.error('Experience insert error:', error);
    return next(
      new AppError(error.message || 'Could not create experience record.', 500)
    );
  }

  res.status(201).json({
    status: 'success',
    data
  });
});

// -----------------------
// Blogs: create blog post
// -----------------------
exports.blogs = catchAsync(async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return next(new AppError('User authentication required', 401));
  }

  const userId = req.user.id;
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

  // Normalize title: some multipart/form-data clients send text fields as arrays.
  let titleValue = title;
  if (Array.isArray(titleValue)) {
    // prefer first non-empty entry
    titleValue = titleValue.find(t => t && String(t).trim()) || titleValue[0];
  }

  if (
    !titleValue ||
    typeof titleValue !== 'string' ||
    !String(titleValue).trim()
  ) {
    return next(new AppError('Title is required', 400));
  }

  // simple slug generator
  const makeSlug = s =>
    s
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

  let finalSlug =
    slug && String(slug).trim() ? String(slug).trim() : makeSlug(titleValue);

  // ensure slug uniqueness: if exists, append timestamp
  const { data: existingSlug } = await supabase
    .from('blogs')
    .select('id')
    .eq('slug', finalSlug)
    .maybeSingle();
  if (existingSlug && existingSlug.id) {
    finalSlug = `${finalSlug}-${Date.now()}`;
  }

  // normalize published boolean
  const isPublished =
    published === true ||
    published === 'true' ||
    published === '1' ||
    published === 1;

  // normalize tags (accept array or CSV)
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

  const tagsArr = normalizeArray(tags);

  // Handle cover image upload if provided (support req.files.coverImage, req.files.profileImage, or req.file)
  let coverImageUrl = null;
  const bucketName = 'uploads';
  let imageFile = null;

  if (req.files && req.files.coverImage && req.files.coverImage[0])
    imageFile = req.files.coverImage[0];
  else if (req.files && req.files.profileImage && req.files.profileImage[0])
    imageFile = req.files.profileImage[0];
  else if (req.file) imageFile = req.file;

  if (imageFile) {
    const ext = path.extname(imageFile.originalname) || '';
    const filename = `blogs/cover-user-${userId}-${Date.now()}${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filename, imageFile.buffer, {
        contentType: imageFile.mimetype,
        upsert: true
      });

    if (uploadError) {
      return next(
        new AppError(uploadError.message || 'Failed to upload cover image', 500)
      );
    }

    const { data: urlData } = await supabase.storage
      .from(bucketName)
      .getPublicUrl(filename);
    coverImageUrl = urlData && urlData.publicUrl ? urlData.publicUrl : null;
  }

  const payload = {
    user_id: userId,
    title: String(titleValue).trim(),
    slug: finalSlug,
    excerpt: excerpt || null,
    content: content || null,
    author: author || null,
    tags: tagsArr,
    published: isPublished || false,
    published_at: published_at || null
  };

  if (coverImageUrl) payload.cover_image = coverImageUrl;

  const { data, error } = await supabase
    .from('blogs')
    .insert(payload)
    .select()
    .single();
  if (error) {
    console.error('Blogs insert error:', error);
    return next(new AppError(error.message || 'Could not create blog', 500));
  }

  res.status(201).json({ status: 'success', data });
});

// -----------------------
// Projects: create project
// -----------------------
exports.project = catchAsync(async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return next(new AppError('User authentication required', 401));
  }

  const userId = req.user.id;
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

  // Normalize title (handle multipart arrays)
  let titleValue = title;
  if (Array.isArray(titleValue)) {
    titleValue = titleValue.find(t => t && String(t).trim()) || titleValue[0];
  }

  if (
    !titleValue ||
    typeof titleValue !== 'string' ||
    !String(titleValue).trim()
  ) {
    return next(new AppError('Title is required', 400));
  }

  // Helper to normalize array fields (CSV or array)
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

  const techs = normalizeArray(technologies);

  // Handle project image upload if provided
  let imageUrl = null;
  const bucketName = 'uploads';
  let imageFile = null;

  if (req.files && req.files.projectImage && req.files.projectImage[0])
    imageFile = req.files.projectImage[0];
  else if (req.files && req.files.coverImage && req.files.coverImage[0])
    imageFile = req.files.coverImage[0];
  else if (req.files && req.files.profileImage && req.files.profileImage[0])
    imageFile = req.files.profileImage[0];
  else if (req.file) imageFile = req.file;

  if (imageFile) {
    const ext = path.extname(imageFile.originalname) || '';
    const filename = `projects/image-user-${userId}-${Date.now()}${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filename, imageFile.buffer, {
        contentType: imageFile.mimetype,
        upsert: true
      });

    if (uploadError) {
      return next(
        new AppError(
          uploadError.message || 'Failed to upload project image',
          500
        )
      );
    }

    const { data: urlData } = await supabase.storage
      .from(bucketName)
      .getPublicUrl(filename);
    imageUrl = urlData && urlData.publicUrl ? urlData.publicUrl : null;
  }

  const payload = {
    user_id: userId,
    title: String(titleValue).trim(),
    description: description || null,
    long_description: long_description || null,
    image_url: imageUrl || null,
    demo_url: demo_url || null,
    github_url: github_url || null,
    technologies: techs,
    category: category || null,
    featured:
      featured === true ||
      featured === 'true' ||
      featured === '1' ||
      featured === 1
  };

  if (order_index !== undefined) {
    const oi = Number(order_index);
    if (!Number.isNaN(oi)) payload.order_index = oi;
  }

  const { data, error } = await supabase
    .from('projects')
    .insert(payload)
    .select()
    .single();
  if (error) {
    console.error('Projects insert error:', error);
    return next(new AppError(error.message || 'Could not create project', 500));
  }

  res.status(201).json({ status: 'success', data });
});

// -----------------------
// Services: create service
// -----------------------
exports.services = catchAsync(async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return next(new AppError('User authentication required', 401));
  }

  const userId = req.user.id;
  const { title, description, features, price_range, active, order_index } =
    req.body;

  // Normalize title (handle multipart arrays)
  let titleValue = title;
  if (Array.isArray(titleValue)) {
    titleValue = titleValue.find(t => t && String(t).trim()) || titleValue[0];
  }

  if (
    !titleValue ||
    typeof titleValue !== 'string' ||
    !String(titleValue).trim()
  ) {
    return next(new AppError('Title is required', 400));
  }

  // Normalize features (accept array or CSV)
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

  const featuresArr = normalizeArray(features);

  const payload = {
    user_id: userId,
    title: String(titleValue).trim(),
    description: description || null,
    features: featuresArr,
    price_range: price_range || null,
    active:
      active === undefined
        ? true
        : active === true || active === 'true' || active === '1' || active === 1
  };

  if (order_index !== undefined) {
    const oi = Number(order_index);
    if (!Number.isNaN(oi)) payload.order_index = oi;
  }

  const { data, error } = await supabase
    .from('services')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Services insert error:', error);
    return next(new AppError(error.message || 'Could not create service', 500));
  }

  res.status(201).json({ status: 'success', data });
});

// -----------------------
// Skills: create skill
// -----------------------
exports.skills = catchAsync(async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return next(new AppError('User authentication required', 401));
  }

  const userId = req.user.id;
  const { name, category, proficiency, order_index } = req.body;

  // Name is required
  if (!name || String(name).trim() === '') {
    return next(new AppError('Name is required', 400));
  }

  // Parse and validate proficiency if provided
  let profValue = null;
  if (proficiency !== undefined && proficiency !== null && proficiency !== '') {
    const p = Number(proficiency);
    if (Number.isNaN(p) || !Number.isInteger(p)) {
      return next(
        new AppError('Proficiency must be an integer between 0 and 100', 400)
      );
    }
    if (p < 0 || p > 100) {
      return next(new AppError('Proficiency must be between 0 and 100', 400));
    }
    profValue = p;
  }

  // Parse order_index if provided
  let orderIndexValue;
  if (order_index !== undefined && order_index !== null && order_index !== '') {
    const oi = Number(order_index);
    if (Number.isNaN(oi)) {
      return next(new AppError('order_index must be a number', 400));
    }
    orderIndexValue = oi;
  }

  const payload = {
    user_id: userId,
    name: String(name).trim(),
    category: category || null
  };

  if (profValue !== null) payload.proficiency = profValue;
  if (orderIndexValue !== undefined) payload.order_index = orderIndexValue;

  const { data, error } = await supabase
    .from('skills')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Skills insert error:', error);
    return next(new AppError(error.message || 'Could not create skill', 500));
  }

  res.status(201).json({ status: 'success', data });
});

// Get portfolio: about, blogs, experience, projects, services, skills
exports.getPortfolio = catchAsync(async (req, res, next) => {
  if (!req.user || !req.user.id)
    return next(new AppError('User authentication required', 401));
  const userId = req.user.id;

  // Helper to recursively remove keys with null or undefined values
  const removeNulls = val => {
    if (val === null || val === undefined) return null;
    if (Array.isArray(val)) {
      return val
        .map(v => removeNulls(v))
        .filter(v => v !== null && v !== undefined);
    }
    if (typeof val === 'object') {
      const out = {};
      Object.keys(val).forEach(k => {
        const v = removeNulls(val[k]);
        if (v !== null && v !== undefined) out[k] = v;
      });
      return out;
    }
    return val;
  };

  const results = {};

  // about (single)
  const { data: aboutData, error: aboutErr } = await supabase
    .from('about')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (aboutErr) {
    console.error('About fetch error:', aboutErr);
    return next(new AppError('Could not fetch about data', 500));
  }
  results.about = aboutData || null;

  // blogs
  const { data: blogsData, error: blogsErr } = await supabase
    .from('blogs')
    .select('*')
    .eq('user_id', userId);
  if (blogsErr) {
    console.error('Blogs fetch error:', blogsErr);
    return next(new AppError('Could not fetch blogs data', 500));
  }
  results.blogs = blogsData || [];

  // experience
  const { data: expData, error: expErr } = await supabase
    .from('experience')
    .select('*')
    .eq('user_id', userId);
  if (expErr) {
    console.error('Experience fetch error:', expErr);
    return next(new AppError('Could not fetch experience data', 500));
  }
  results.experience = expData || [];

  // projects (only featured ones for portfolio display)
  const { data: projectsData, error: projectsErr } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .eq('featured', true);
  if (projectsErr) {
    console.error('Projects fetch error:', projectsErr);
    return next(new AppError('Could not fetch projects data', 500));
  }
  results.projects = projectsData || [];

  // services
  const { data: servicesData, error: servicesErr } = await supabase
    .from('services')
    .select('*')
    .eq('user_id', userId);
  if (servicesErr) {
    console.error('Services fetch error:', servicesErr);
    return next(new AppError('Could not fetch services data', 500));
  }
  results.services = servicesData || [];

  // skills
  const { data: skillsData, error: skillsErr } = await supabase
    .from('skills')
    .select('*')
    .eq('user_id', userId);
  if (skillsErr) {
    console.error('Skills fetch error:', skillsErr);
    return next(new AppError('Could not fetch skills data', 500));
  }
  results.skills = skillsData || [];

  // Check if portfolio is published from publish table
  const { data: publishData, error: publishErr } = await supabase
    .from('publish')
    .select('ispublished')
    .eq('user_id', userId)
    .maybeSingle();

  results.is_published = publishData?.ispublished || false;

  // Get username from users table
  const { data: userData, error: userErr } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .maybeSingle();

  // Use email as username (or you can add a separate username field to users table)
  results.username = userData?.email?.split('@')[0] || userId;

  // Clean null values from results
  const cleaned = removeNulls(results);

  res.status(200).json({ status: 'success', data: cleaned });
});

// Get all projects for the authenticated user (including non-featured)
exports.getAllProjects = catchAsync(async (req, res, next) => {
  if (!req.user || !req.user.id)
    return next(new AppError('User authentication required', 401));
  const userId = req.user.id;

  const { data: projectsData, error: projectsErr } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('order_index', { ascending: true });

  if (projectsErr) {
    console.error('Projects fetch error:', projectsErr);
    return next(new AppError('Could not fetch projects data', 500));
  }

  res.status(200).json({ status: 'success', data: projectsData || [] });
});

// Public route to get portfolio by username
exports.getPublicPortfolio = catchAsync(async (req, res, next) => {
  const { username } = req.params;

  if (!username) {
    return next(new AppError('Username is required', 400));
  }

  // Find user by email prefix (username)
  const { data: usersData, error: userErr } = await supabase
    .from('users')
    .select('id, email')
    .ilike('email', `${username}@%`);

  if (userErr || !usersData || usersData.length === 0) {
    return next(new AppError('Portfolio not found', 404));
  }

  const userData = usersData[0];
  const userId = userData.id;

  // Check if portfolio is published
  const { data: publishData, error: publishErr } = await supabase
    .from('publish')
    .select('ispublished')
    .eq('user_id', userId)
    .maybeSingle();

  if (publishErr || !publishData || !publishData.ispublished) {
    return next(new AppError('This portfolio is not published', 403));
  }

  // Helper to recursively remove keys with null or undefined values
  const removeNulls = val => {
    if (val === null || val === undefined) return null;
    if (Array.isArray(val)) {
      return val
        .map(v => removeNulls(v))
        .filter(v => v !== null && v !== undefined);
    }
    if (typeof val === 'object') {
      const out = {};
      Object.keys(val).forEach(k => {
        const v = removeNulls(val[k]);
        if (v !== null && v !== undefined) out[k] = v;
      });
      return out;
    }
    return val;
  };

  const results = {};

  // Fetch all portfolio data
  const { data: aboutData } = await supabase
    .from('about')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  results.about = aboutData || null;

  const { data: blogsData } = await supabase
    .from('blogs')
    .select('*')
    .eq('user_id', userId);
  results.blogs = blogsData || [];

  const { data: expData } = await supabase
    .from('experience')
    .select('*')
    .eq('user_id', userId);
  results.experience = expData || [];

  const { data: projectsData } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId);
  results.projects = projectsData || [];

  const { data: servicesData } = await supabase
    .from('services')
    .select('*')
    .eq('user_id', userId);
  results.services = servicesData || [];

  const { data: skillsData } = await supabase
    .from('skills')
    .select('*')
    .eq('user_id', userId);
  results.skills = skillsData || [];

  const cleaned = removeNulls(results);

  res.status(200).json({ status: 'success', data: cleaned });
});

// Toggle publish status
exports.togglePublish = catchAsync(async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return next(new AppError('User authentication required', 401));
  }

  const userId = req.user.id;

  // Get current publish status from publish table
  const { data: currentData, error: fetchErr } = await supabase
    .from('publish')
    .select('ispublished')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) {
    return next(new AppError('Could not fetch publish status', 500));
  }

  const newPublishStatus = !(currentData?.ispublished || false);

  // Update or insert publish status
  if (currentData) {
    // Update existing record
    const { error: updateErr } = await supabase
      .from('publish')
      .update({
        ispublished: newPublishStatus,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateErr) {
      return next(new AppError('Could not update publish status', 500));
    }
  } else {
    // Insert new record
    const { error: insertErr } = await supabase.from('publish').insert({
      user_id: userId,
      ispublished: newPublishStatus
    });

    if (insertErr) {
      return next(new AppError('Could not create publish status', 500));
    }
  }

  res.status(200).json({
    status: 'success',
    data: { is_published: newPublishStatus }
  });
});

// --------------------------
// File upload middlewares
// --------------------------

// Resume upload middleware (accepts PDF and images)
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else
      cb(
        new AppError('Resume: Only PDF and PNG/JPEG images are allowed', 400),
        false
      );
  }
});

// Profile image upload middleware (accepts only images)
const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else
      cb(
        new AppError(
          'Profile image: Only PNG and JPEG images are allowed',
          400
        ),
        false
      );
  }
});

exports.publish = catchAsync(async (req, res, next) => {
  const { publish } = req.body;

  const { error } = await supabase
    .from('publish')
    .update({ ispublished: publish })
    .eq('user_id', req.user.id);

  if (error) {
    return next(
      new AppError(error.message || 'Porfolio Can not be published.', 400)
    );
  }

  res.status(204).json({
    status: 'success'
  });
});

// Export middleware that accepts both resume and profileImage fields
exports.uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
}).fields([
  { name: 'resume', maxCount: 1 },
  { name: 'profileImage', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
  { name: 'projectImage', maxCount: 1 }
]);

exports.uploadResumeMiddleware = resumeUpload.single('resume');
exports.uploadProfileImageMiddleware =
  profileImageUpload.single('profileImage');
exports.uploadCoverMiddleware = profileImageUpload.single('coverImage');
exports.uploadProjectImage = profileImageUpload.single('projectImage');

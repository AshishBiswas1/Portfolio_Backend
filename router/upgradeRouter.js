const express = require('express');
const authController = require('./../controller/authController');
const updateController = require('./../controller/updateController');
const userController = require('./../controller/userController');

const router = express.Router();

// protect and restrict
router.use(authController.protect, authController.restrictTo('user-admin'));

// About: allow resume/profile image uploads
router
  .route('/about/:id')
  .patch(userController.uploadMiddleware, updateController.updateAbout);

// Blogs: allow cover image upload
router
  .route('/blogs/:id')
  .patch(userController.uploadCoverMiddleware, updateController.updateBlog);

// Experience: allow profileImage to be used as company_logo
router
  .route('/experience/:id')
  .patch(userController.uploadMiddleware, updateController.updateExperience);

// Projects: allow project image upload
router
  .route('/projects/:id')
  .patch(userController.uploadProjectImage, updateController.updateProject);

// Services: text fields only
router.route('/services/:id').patch(updateController.updateService);

// Skills: text fields only
router.route('/skills/:id').patch(updateController.updateSkill);

module.exports = router;

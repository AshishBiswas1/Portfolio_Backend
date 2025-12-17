const express = require('express');
const authController = require('./../controller/authController');
const userController = require('./../controller/userController');
const messageController = require('./../controller/messageController');

const router = express.Router();

router.route('/signup').post(authController.signup);
router.route('/login').post(authController.login);

// Public: send a message (contact form)
router.route('/messages').post(messageController.sendMessage);

// Public: get published portfolio by username
router.route('/portfolio/:username').get(userController.getPublicPortfolio);

// Public: get portfolio by user ID (for direct user ID access)
router
  .route('/portfolio/user/:userId')
  .get(userController.getPortfolioByUserId);

router.use(authController.protect, authController.restrictTo('user-admin'));

router.route('/Me').get(userController.getMe);
router.route('/updateMe').patch(userController.updateMe);
router.route('/deleteMe').delete(userController.deleteMe);

router
  .route('/about')
  .post(userController.uploadMiddleware, userController.about);

router.route('/experience').post(userController.experience);

router.route('/portfolio').get(userController.getPortfolio);

// Get all projects (including non-featured) for editing
router.route('/projects').get(userController.getAllProjects);

// Toggle publish status
router.route('/publish').post(userController.togglePublish);

// Protected: fetch received messages
router.route('/messages').get(messageController.getMessages);

router
  .route('/blogs')
  .post(userController.uploadCoverMiddleware, userController.blogs);

router
  .route('/project')
  .post(userController.uploadProjectImage, userController.project);

router.route('/services').post(userController.services);
router.route('/services').post(userController.services);

router.route('/skills').post(userController.skills);

module.exports = router;

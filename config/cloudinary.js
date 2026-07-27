const cloudinary = require('cloudinary').v2;

function initCloudinary(env) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key:    env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET
  });
  return cloudinary;
}

module.exports = { initCloudinary };

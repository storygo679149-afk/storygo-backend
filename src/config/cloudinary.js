const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const environment = require('./environment');

cloudinary.config({
  cloud_name: environment.CLOUDINARY_CLOUD_NAME,
  api_key: environment.CLOUDINARY_API_KEY,
  api_secret: environment.CLOUDINARY_API_SECRET,
  secure: true
});

console.log('Cloudinary config:', cloudinary.config().cloud_name);

const audioStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'pocket-fm/audio', resource_type: 'video', format: 'mp3' }
});

const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'pocket-fm/thumbnails', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] }
});

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - Cloudinary public ID of the file
 * @param {string} resourceType - 'image' or 'video' (default 'image')
 */
const deleteFile = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
};

module.exports = { cloudinary, audioStorage, imageStorage, deleteFile };
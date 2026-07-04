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

// IMPORTANT: new audio uploads use delivery type 'authenticated' (NOT
// access_mode, which Cloudinary has deprecated and no longer enforces).
// type: 'authenticated' means Cloudinary itself will refuse to serve the
// file unless the request includes a valid, time-limited signature.
const audioStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'pocket-fm/audio', resource_type: 'video', format: 'mp3', type: 'authenticated' }
});

const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'pocket-fm/thumbnails', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] }
});

/**
 * Delete a file from Cloudinary.
 * @param {string} type - must match how the file was uploaded:
 *   'upload' (legacy/public) or 'authenticated' (new/private).
 */
const deleteFile = async (publicId, resourceType = 'image', type = 'upload') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type });
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
};

/**
 * Generate a fresh, short-lived signed URL for a private ("authenticated"
 * type) Cloudinary audio asset. Even someone holding this exact URL
 * can't reuse it once it expires, and can't construct a valid one
 * without our API secret.
 */
const getSignedAudioUrl = (publicId, ttlSeconds = 300) => {
  return cloudinary.url(publicId, {
    resource_type: 'video',
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds
  });
};

/**
 * Convert an ALREADY-UPLOADED public ('upload' type) file to the private
 * 'authenticated' type, in place -- no re-upload of the actual audio
 * bytes needed. Used by the one-time migration for pre-existing episodes.
 */
const lockdownAudioAsset = async (publicId) => {
  return cloudinary.uploader.rename(publicId, publicId, {
    resource_type: 'video',
    type: 'upload',
    to_type: 'authenticated',
    invalidate: true,
    overwrite: true
  });
};

module.exports = { cloudinary, audioStorage, imageStorage, deleteFile, getSignedAudioUrl, lockdownAudioAsset };

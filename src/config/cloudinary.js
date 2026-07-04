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

// IMPORTANT: new audio uploads get access_mode: 'authenticated'.
// This means Cloudinary itself will refuse to serve the file unless the
// request includes a valid, time-limited signature -- the raw delivery
// URL alone (even if leaked) is useless without a fresh signature that
// only our backend (holding the API secret) can generate.
const audioStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'pocket-fm/audio', resource_type: 'video', format: 'mp3', access_mode: 'authenticated' }
});

const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'pocket-fm/thumbnails', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] }
});

/**
 * Delete a file from Cloudinary
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

/**
 * Generate a fresh, short-lived signed URL for a private ("authenticated"
 * access_mode) Cloudinary audio asset. Even someone holding this exact
 * URL can't reuse it once it expires, and can't construct a valid one
 * without our API secret.
 */
const getSignedAudioUrl = (publicId, ttlSeconds = 300) => {
  return cloudinary.url(publicId, {
    resource_type: 'video',
    type: 'upload',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds
  });
};

/**
 * Lock down an ALREADY-UPLOADED public file, no re-upload needed.
 * Used by the one-time migration script for existing episodes.
 *
 * Two steps are needed:
 * 1. Flip access_mode to 'authenticated' (controls future requests)
 * 2. Explicitly invalidate the CDN's cached copy of the old public URL
 *    (without this, a previously-cached copy can keep being served for
 *    a while even after step 1)
 */
const lockdownAudioAsset = async (publicId) => {
  await cloudinary.api.update(publicId, { resource_type: 'video', access_mode: 'authenticated' });
  return cloudinary.uploader.explicit(publicId, {
    resource_type: 'video',
    type: 'upload',
    invalidate: true
  });
};

module.exports = { cloudinary, audioStorage, imageStorage, deleteFile, getSignedAudioUrl, lockdownAudioAsset };

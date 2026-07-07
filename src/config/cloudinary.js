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

// New audio uploads use delivery type 'authenticated' (Cloudinary requires
// a valid signature to serve the file at all). No eager transformation is
// needed for HLS -- Cloudinary can package audio into an .m3u8 playlist
// on-the-fly at delivery time just by requesting format: 'm3u8' in the
// signed URL (see getSignedHlsUrl below).
const audioStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pocket-fm/audio',
    resource_type: 'video',
    format: 'mp3',
    type: 'authenticated'
  }
});

const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'pocket-fm/thumbnails', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] }
});

const deleteFile = async (publicId, resourceType = 'image', type = 'upload') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type });
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
};

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
 * Signed URL for the HLS manifest, generated on-the-fly by Cloudinary --
 * no eager pre-generation needed. This is what the frontend player
 * (via hls.js) should load.
 */
const getSignedHlsUrl = (publicId, ttlSeconds = 300) => {
  return cloudinary.url(publicId, {
    resource_type: 'video',
    type: 'authenticated',
    format: 'm3u8',
    transformation: [{ streaming_profile: 'auto' }],
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds
  });
};

/**
 * Convert an already-uploaded public file to private 'authenticated'
 * type in place. Used by the one-time migration for pre-existing
 * episodes. No eager step needed -- HLS packaging happens on-the-fly.
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

module.exports = { cloudinary, audioStorage, imageStorage, deleteFile, getSignedAudioUrl, getSignedHlsUrl, lockdownAudioAsset };

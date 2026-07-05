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
// a valid signature to serve the file at all), AND request an eager HLS
// transformation -- Cloudinary transcodes the audio into an .m3u8 playlist
// plus small encrypted-at-transport segment (.ts) files, so the browser
// never fetches one clean downloadable MP3. This uses Cloudinary's own
// transcoding, not our server, so it doesn't strain the Render free tier.
const audioStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pocket-fm/audio',
    resource_type: 'video',
    format: 'mp3',
    type: 'authenticated',
    eager: [{ format: 'm3u8' }],
    eager_async: false // wait for HLS to be ready before responding (fine for short audio files)
  }
});

const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: 'pocket-fm/thumbnails', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] }
});

/**
 * Delete a file from Cloudinary.
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
 * Fresh, short-lived signed URL for the plain MP3 (kept as a fallback
 * for any code path that still expects a single audio file).
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
 * Fresh, short-lived signed URL for the HLS manifest (.m3u8) of an
 * episode. This is what the frontend player (via hls.js) should load.
 */
const getSignedHlsUrl = (publicId, ttlSeconds = 300) => {
  return cloudinary.url(publicId, {
    resource_type: 'video',
    type: 'authenticated',
    format: 'm3u8',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds
  });
};

/**
 * Convert an already-uploaded public file to private 'authenticated'
 * type in place. Used by the one-time migration for pre-existing
 * episodes. Also (re)requests the eager HLS transformation, since
 * older uploads won't have one yet.
 */
const lockdownAudioAsset = async (publicId) => {
  await cloudinary.uploader.rename(publicId, publicId, {
    resource_type: 'video',
    type: 'upload',
    to_type: 'authenticated',
    invalidate: true,
    overwrite: true
  });
  return cloudinary.uploader.explicit(publicId, {
    resource_type: 'video',
    type: 'authenticated',
    eager: [{ format: 'm3u8' }],
    eager_async: false
  });
};

module.exports = { cloudinary, audioStorage, imageStorage, deleteFile, getSignedAudioUrl, getSignedHlsUrl, lockdownAudioAsset };

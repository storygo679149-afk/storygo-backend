const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const environment = require('../config/environment');

cloudinary.config({
  cloud_name: environment.CLOUDINARY_CLOUD_NAME,
  api_key: environment.CLOUDINARY_API_KEY,
  api_secret: environment.CLOUDINARY_API_SECRET,
  secure: true,
});

const ALLOWED_AUDIO_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
  'audio/x-m4a', 'audio/mp4', 'audio/webm'
];
const ALLOWED_IMAGE_MIMES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp'
];

class DynamicCloudinaryStorage extends CloudinaryStorage {
  _handleFile(req, file, cb) {
    if (file.fieldname === 'audio') {
      this.params = {
        folder: 'pocket-fm/audio',
        resource_type: 'video',
        format: 'mp3',
        chunk_size: 6000000,
        eager: [{ format: 'mp3', audio_codec: 'mp3', audio_frequency: '44100', audio_bitrate: '128k' }],
        eager_async: true,
      };
    } else if (file.fieldname === 'thumbnail') {
      this.params = {
        folder: 'pocket-fm/thumbnails',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      };
    }
    super._handleFile(req, file, cb);
  }
}

// Episode upload (audio + thumbnail)
const uploadEpisode = multer({
  storage: new DynamicCloudinaryStorage({ cloudinary }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audio') {
      if (ALLOWED_AUDIO_MIMES.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Invalid audio file type'), false);
    } else if (file.fieldname === 'thumbnail') {
      if (ALLOWED_IMAGE_MIMES.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Invalid image file type'), false);
    } else {
      cb(new Error('Unexpected field'), false);
    }
  },
}).fields([
  { name: 'audio', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

// Audio‑only upload
const audioUpload = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: { folder: 'pocket-fm/audio', resource_type: 'video', format: 'mp3' },
  }),
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid audio file type'), false);
  },
}).single('audio');

// Image‑only upload for thumbnails (series, episodes)
const imageUpload = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: { folder: 'pocket-fm/thumbnails', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] },
  }),
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid image file type'), false);
  },
}).single('thumbnail');

// Avatar upload
const avatarUpload = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'pocket-fm/avatars',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      transformation: [{ width: 300, height: 300, crop: 'fill' }]
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid image type'), false);
  },
}).single('avatar');

// 🆕 Novel cover upload (field name = 'cover_image')
const coverUpload = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'pocket-fm/novel-covers',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid image type'), false);
  },
}).single('cover_image');

module.exports = {
  uploadEpisode,
  uploadAudio: audioUpload,
  uploadImage: imageUpload,
  avatarUpload,
  coverUpload,   // ← export the new middleware
};
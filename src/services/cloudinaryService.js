const { cloudinary, uploadAudio, uploadImage, deleteFile } = require('../config/cloudinary');

class CloudinaryService {
  // Upload and optimize audio file
  static async uploadAudioFile(filePath, metadata = {}) {
    try {
      const result = await uploadAudio(filePath, {
        ...metadata,
        eager: [
          { format: 'mp3', audio_codec: 'mp3', audio_frequency: '44100', audio_bitrate: '128k' }
        ],
        eager_async: true
      });

      return {
        success: true,
        data: {
          url: result.url,
          publicId: result.publicId,
          duration: result.duration,
          size: result.size,
          format: result.format
        }
      };
    } catch (error) {
      console.error('Cloudinary audio upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Upload and optimize image
  static async uploadImageFile(filePath, metadata = {}) {
    try {
      const result = await uploadImage(filePath, {
        ...metadata,
        transformation: [
          { width: 800, height: 800, crop: 'fill', quality: 'auto:good' }
        ]
      });

      return {
        success: true,
        data: {
          url: result.url,
          publicId: result.publicId,
          thumbnailUrl: result.thumbnailUrl
        }
      };
    } catch (error) {
      console.error('Cloudinary image upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete file from Cloudinary
  static async deleteFile(publicId, resourceType = 'image') {
    try {
      await deleteFile(publicId, resourceType);
      return { success: true };
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate streaming URL with transformations
  static getStreamingUrl(publicId) {
    return cloudinary.url(publicId, {
      resource_type: 'video',
      format: 'mp3',
      flags: 'streaming_attachment'
    });
  }

  // Get optimized thumbnail URL
  static getThumbnailUrl(publicId, width = 400, height = 400) {
    return cloudinary.url(publicId, {
      width,
      height,
      crop: 'fill',
      quality: 'auto:good'
    });
  }
}

module.exports = CloudinaryService;
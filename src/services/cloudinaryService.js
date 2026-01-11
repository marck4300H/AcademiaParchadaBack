// src/services/cloudinaryService.js
import cloudinary from '../config/cloudinary.js';

export function uploadBufferToCloudinary({ buffer, folder, resource_type = 'auto' }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type },
      (error, result) => {
        if (error) return reject(new Error(error.message));
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type,
          bytes: result.bytes
        });
      }
    );
    stream.end(buffer);
  });
}

export async function deleteFromCloudinary({ public_id, resource_type = 'auto' }) {
  if (!public_id) return;
  await cloudinary.uploader.destroy(public_id, { resource_type });
}

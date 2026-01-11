// src/middlewares/uploadMemory.js
import multer from 'multer';

const storage = multer.memoryStorage();

export const uploadSingle = (field) =>
  multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
  }).single(field);

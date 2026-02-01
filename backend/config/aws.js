const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.AWS_S3_BUCKET;

/**
 * Upload image to S3
 * @param {Buffer} fileBuffer - Image buffer
 * @param {string} fileName - Original filename
 * @param {string} mimeType - File mime type
 * @returns {Promise<string>} - S3 URL
 */
const uploadToS3 = async (fileBuffer, fileName, mimeType) => {
  const fileExtension = fileName.split('.').pop();
  const key = `uploads/${uuidv4()}.${fileExtension}`;

  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: 'private', // Changed to private for security
    Metadata: {
      originalName: fileName
    }
  };

  try {
    const data = await s3.upload(params).promise();
    console.log('✅ File uploaded to S3:', data.Location);
    return {
      url: data.Location,
      key: data.Key,
      bucket: data.Bucket
    };
  } catch (error) {
    console.error('❌ S3 upload error:', error);
    throw new Error('Failed to upload file to S3');
  }
};

/**
 * Get signed URL for private S3 object
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiration in seconds (default 3600)
 * @returns {Promise<string>} - Signed URL
 */
const getSignedUrl = async (key, expiresIn = 3600) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: expiresIn
  };

  try {
    const url = await s3.getSignedUrlPromise('getObject', params);
    return url;
  } catch (error) {
    console.error('❌ Error generating signed URL:', error);
    throw new Error('Failed to generate signed URL');
  }
};

/**
 * Delete file from S3
 * @param {string} key - S3 object key
 * @returns {Promise<void>}
 */
const deleteFromS3 = async (key) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key
  };

  try {
    await s3.deleteObject(params).promise();
    console.log('✅ File deleted from S3:', key);
  } catch (error) {
    console.error('❌ S3 delete error:', error);
    throw new Error('Failed to delete file from S3');
  }
};

/**
 * Check if file exists in S3
 * @param {string} key - S3 object key
 * @returns {Promise<boolean>}
 */
const fileExists = async (key) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key
  };

  try {
    await s3.headObject(params).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
};

module.exports = {
  uploadToS3,
  getSignedUrl,
  deleteFromS3,
  fileExists,
  s3,
  BUCKET_NAME
};

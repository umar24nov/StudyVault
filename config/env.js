const { z } = require('zod');

const envSchema = z.object({
  FIREBASE_PROJECT_ID:   z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_CLIENT_EMAIL: z.string().email('FIREBASE_CLIENT_EMAIL must be a valid email'),
  FIREBASE_PRIVATE_KEY:  z.string().min(1, 'FIREBASE_PRIVATE_KEY is required'),
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY:    z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),
  ADMIN_KEY:             z.string().optional(),
  PORT:                  z.coerce.number().default(3000),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('\x1b[31m❌ Missing or invalid environment variables:\x1b[0m');
    result.error.issues.forEach(issue => {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
}

module.exports = { validateEnv };

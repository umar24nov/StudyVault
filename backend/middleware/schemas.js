const { z } = require('zod');

const email = () => z.string().trim().max(254).email('Invalid email address');

const reviewSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be under 100 characters'),
  message: z.string().trim().min(1, 'Message is required').max(500, 'Message must be under 500 characters'),
  stars: z.coerce.number('Stars must be a number').int('Stars must be a whole number').min(1, 'Stars must be between 1 and 5').max(5, 'Stars must be between 1 and 5')
});

const feedbackSchema = z.object({
  type: z.string().trim().max(50, 'Type must be under 50 characters').optional(),
  message: z.string().trim().min(1, 'Message is required').max(1000, 'Message must be under 1000 characters')
});

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be under 100 characters'),
  email: email(),
  message: z.string().trim().min(1, 'Message is required').max(2000, 'Message must be under 2000 characters')
});

const ratingSchema = z.object({
  stars: z.coerce.number('Stars must be a number').int('Stars must be a whole number').min(1, 'Stars must be between 1 and 5').max(5, 'Stars must be between 1 and 5')
});

const reportSchema = z.object({
  reason: z.string().trim().min(1, 'Please describe the issue.').max(500, 'Reason must be under 500 characters')
});

const paperUploadSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be under 200 characters'),
  course: z.string().trim().min(1, 'Course is required').max(100, 'Course must be under 100 characters'),
  type: z.string().trim().max(20, 'Type must be under 20 characters').optional(),
  year: z.string().trim().max(20, 'Year must be under 20 characters').optional(),
  university: z.string().trim().max(200, 'University must be under 200 characters').optional(),
  uploaderName: z.string().trim().max(100, 'Name must be under 100 characters').optional(),
  uploaderEmail: email().or(z.literal('')).optional(),
  tags: z.union([
    z.array(z.string().trim().max(50, 'Tags must be under 50 characters')).max(10, 'Too many tags'),
    z.string().trim().max(500, 'Tags must be under 500 characters')
  ]).optional()
});

const profileUpdateSchema = z.object({
  name: z.string().trim().max(100, 'Name must be under 100 characters').optional(),
  university: z.string().trim().max(200, 'University must be under 200 characters').optional(),
  course: z.string().trim().max(100, 'Course must be under 100 characters').optional(),
  level: z.string().trim().max(50, 'Level must be under 50 characters').optional(),
  grade: z.string().trim().max(10, 'Grade must be under 10 characters').optional(),
  board: z.string().trim().max(50, 'Board must be under 50 characters').optional()
});

const paperPatchSchema = z.object({
  title: z.string().trim().max(200, 'Title must be under 200 characters').optional(),
  type: z.string().trim().max(20, 'Type must be under 20 characters').optional(),
  course: z.string().trim().max(100, 'Course must be under 100 characters').optional(),
  university: z.string().trim().max(200, 'University must be under 200 characters').optional(),
  year: z.string().trim().max(20, 'Year must be under 20 characters').optional()
});

const rejectReasonSchema = z.object({
  reason: z.string().trim().max(500, 'Reason must be under 500 characters').optional()
});

module.exports = {
  reviewSchema,
  feedbackSchema,
  contactSchema,
  ratingSchema,
  reportSchema,
  paperUploadSchema,
  profileUpdateSchema,
  paperPatchSchema,
  rejectReasonSchema
};

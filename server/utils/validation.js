const Joi = require('joi');

// User registration schema
const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .required()
    .messages({
      'string.alphanum': 'Username must only contain alphanumeric characters',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username must not exceed 30 characters',
      'any.required': 'Username is required'
    }),
  
  password: Joi.string()
    .min(8)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'any.required': 'Password is required'
    })
});

// User login schema
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

// Room creation schema
const createRoomSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.min': 'Room name must be at least 3 characters long',
      'string.max': 'Room name must not exceed 50 characters',
      'any.required': 'Room name is required'
    }),
  
  maxPlayers: Joi.number()
    .integer()
    .min(2)
    .max(8)
    .default(8)
    .messages({
      'number.min': 'Room must allow at least 2 players',
      'number.max': 'Room cannot exceed 8 players'
    }),
  
  difficulty: Joi.string()
    .valid('Easy', 'Medium', 'Hard', 'Mixed')
    .default('Medium'),
  
  eloMin: Joi.number()
    .integer()
    .min(0)
    .max(3000)
    .default(0),
  
  eloMax: Joi.number()
    .integer()
    .min(0)
    .max(3000)
    .default(3000)
    .greater(Joi.ref('eloMin'))
    .messages({
      'number.greater': 'Maximum ELO must be greater than minimum ELO'
    })
});

// Profile update schema
const updateProfileSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .optional(),
  
  email: Joi.string()
    .email()
    .optional()
});

// Password reset request schema
const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
});

// Password reset schema
const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Reset token is required'
    }),
  
  password: Joi.string()
    .min(8)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'any.required': 'Password is required'
    })
});

/**
 * Validate request data against schema
 * @param {Object} data - Data to validate
 * @param {Object} schema - Joi schema
 * @returns {Object} Validation result
 */
const validateRequest = (data, schema) => {
  const { error, value } = schema.validate(data, { 
    abortEarly: false,
    stripUnknown: true 
  });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return {
      isValid: false,
      errors,
      value: null
    };
  }
  
  return {
    isValid: true,
    errors: [],
    value
  };
};

module.exports = {
  schemas: {
    register: registerSchema,
    login: loginSchema,
    createRoom: createRoomSchema,
    updateProfile: updateProfileSchema,
    forgotPassword: forgotPasswordSchema,
    resetPassword: resetPasswordSchema
  },
  validateRequest
};
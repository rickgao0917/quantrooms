const express = require('express');
const router = express.Router();
const roomService = require('../services/roomService');
const { authenticate } = require('../middleware/auth');
const { schemas, validateRequest } = require('../utils/validation');

/**
 * @route   GET /api/rooms
 * @desc    Get all active rooms
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const rooms = await roomService.getAllRooms();
    
    res.json({ 
      success: true,
      data: rooms 
    });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch rooms' 
    });
  }
});

/**
 * @route   POST /api/rooms
 * @desc    Create a new room
 * @access  Private
 */
router.post('/', authenticate, async (req, res) => {
  try {
    // Validate request
    const validation = validateRequest(req.body, schemas.createRoom);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors
      });
    }
    
    // Check if user is already in a room
    const currentRoomId = await roomService.getUserCurrentRoom(req.user.userId);
    if (currentRoomId) {
      return res.status(400).json({ 
        success: false,
        error: 'You must leave your current room before creating a new one' 
      });
    }
    
    // Create room
    const room = await roomService.createRoom(req.user.userId, validation.value);
    
    res.status(201).json({ 
      success: true,
      message: 'Room created successfully',
      data: room 
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create room' 
    });
  }
});

/**
 * @route   GET /api/rooms/:id
 * @desc    Get room details
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const room = await roomService.getRoom(req.params.id);
    
    if (!room) {
      return res.status(404).json({ 
        success: false,
        error: 'Room not found' 
      });
    }
    
    res.json({ 
      success: true,
      data: room 
    });
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch room' 
    });
  }
});

/**
 * @route   POST /api/rooms/:id/join
 * @desc    Join a room
 * @access  Private
 */
router.post('/:id/join', authenticate, async (req, res) => {
  try {
    // Check if user is already in a room
    const currentRoomId = await roomService.getUserCurrentRoom(req.user.userId);
    if (currentRoomId) {
      return res.status(400).json({ 
        success: false,
        error: 'You must leave your current room before joining another' 
      });
    }
    
    const room = await roomService.joinRoom(req.params.id, req.user.userId);
    
    res.json({ 
      success: true,
      message: 'Joined room successfully',
      data: room 
    });
  } catch (error) {
    console.error('Error joining room:', error);
    
    if (error.message === 'Room not found') {
      return res.status(404).json({ 
        success: false,
        error: error.message 
      });
    }
    
    if (error.message === 'Room is full' || 
        error.message === 'Already in this room' ||
        error.message.includes('ELO rating')) {
      return res.status(400).json({ 
        success: false,
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to join room' 
    });
  }
});

/**
 * @route   DELETE /api/rooms/:id/leave
 * @desc    Leave a room
 * @access  Private
 */
router.delete('/:id/leave', authenticate, async (req, res) => {
  try {
    const room = await roomService.leaveRoom(req.params.id, req.user.userId);
    
    res.json({ 
      success: true,
      message: 'Left room successfully',
      data: room 
    });
  } catch (error) {
    console.error('Error leaving room:', error);
    
    if (error.message === 'Not in this room') {
      return res.status(400).json({ 
        success: false,
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to leave room' 
    });
  }
});

module.exports = router;
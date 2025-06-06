const db = require('../database/connection');
const { v4: uuidv4 } = require('uuid');

class RoomService {
  /**
   * Create a new room
   */
  async createRoom(userId, roomData) {
    try {
      const { name, maxPlayers = 8, difficulty = 'Medium', eloMin = 0, eloMax = 3000 } = roomData;
      
      // Create room in database
      const [room] = await db('rooms')
        .insert({
          name,
          creator_id: userId,
          current_host_id: userId,
          max_players: maxPlayers,
          current_players: 1,
          elo_min: eloMin,
          elo_max: eloMax,
          difficulty,
          status: 'waiting',
          settings: JSON.stringify(roomData.settings || {})
        })
        .returning('*');
      
      // Add creator as first participant
      await db('room_participants').insert({
        room_id: room.room_id,
        user_id: userId,
        is_host: true
      });
      
      // Get user info for response
      const user = await db('users')
        .where({ user_id: userId })
        .select(['user_id', 'username', 'elo_rating'])
        .first();
      
      return {
        ...room,
        settings: typeof room.settings === 'string' ? JSON.parse(room.settings) : (room.settings || {}),
        players: [{
          id: user.user_id,
          name: user.username,
          elo: user.elo_rating,
          isHost: true,
          joinedAt: new Date()
        }]
      };
    } catch (error) {
      console.error('Create room error:', error);
      throw new Error('Failed to create room');
    }
  }

  /**
   * Join a room
   */
  async joinRoom(roomId, userId) {
    const trx = await db.transaction();
    
    try {
      // Get room with lock to prevent race conditions
      const room = await trx('rooms')
        .where({ room_id: roomId })
        .forUpdate()
        .first();
      
      if (!room) {
        throw new Error('Room not found');
      }
      
      if (room.status !== 'waiting') {
        throw new Error('Room is not accepting new players');
      }
      
      if (room.current_players >= room.max_players) {
        throw new Error('Room is full');
      }
      
      // Check if user is already in room
      const existingParticipant = await trx('room_participants')
        .where({ room_id: roomId, user_id: userId })
        .first();
      
      if (existingParticipant) {
        throw new Error('Already in this room');
      }
      
      // Get user info
      const user = await trx('users')
        .where({ user_id: userId })
        .select(['user_id', 'username', 'elo_rating'])
        .first();
      
      // Check ELO requirements
      if (user.elo_rating < room.elo_min || user.elo_rating > room.elo_max) {
        throw new Error(`ELO rating must be between ${room.elo_min} and ${room.elo_max}`);
      }
      
      // Add participant
      await trx('room_participants').insert({
        room_id: roomId,
        user_id: userId,
        is_host: false
      });
      
      // Update room player count
      await trx('rooms')
        .where({ room_id: roomId })
        .increment('current_players', 1)
        .update({ last_activity: trx.fn.now() });
      
      await trx.commit();
      
      // Return updated room data
      return await this.getRoom(roomId);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Leave a room
   */
  async leaveRoom(roomId, userId) {
    const trx = await db.transaction();
    
    try {
      // Get participant info
      const participant = await trx('room_participants')
        .where({ room_id: roomId, user_id: userId })
        .first();
      
      if (!participant) {
        throw new Error('Not in this room');
      }
      
      // Remove participant
      await trx('room_participants')
        .where({ room_id: roomId, user_id: userId })
        .delete();
      
      // Update room
      const [room] = await trx('rooms')
        .where({ room_id: roomId })
        .decrement('current_players', 1)
        .update({ last_activity: trx.fn.now() })
        .returning('*');
      
      // Handle host leaving
      if (participant.is_host && room.current_players > 0) {
        // Transfer host to next player
        const newHost = await trx('room_participants')
          .where({ room_id: roomId })
          .orderBy('joined_at', 'asc')
          .first();
        
        if (newHost) {
          await trx('room_participants')
            .where({ room_id: roomId, user_id: newHost.user_id })
            .update({ is_host: true });
          
          await trx('rooms')
            .where({ room_id: roomId })
            .update({ current_host_id: newHost.user_id });
        }
      }
      
      await trx.commit();
      
      // Return updated room data or null if empty
      if (room.current_players > 0) {
        return await this.getRoom(roomId);
      }
      
      return null;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Get room details
   */
  async getRoom(roomId) {
    try {
      const room = await db('rooms')
        .where({ room_id: roomId })
        .first();
      
      if (!room) {
        return null;
      }
      
      // Get participants
      const participants = await db('room_participants as rp')
        .join('users as u', 'rp.user_id', 'u.user_id')
        .where({ 'rp.room_id': roomId })
        .select([
          'u.user_id as id',
          'u.username as name',
          'u.elo_rating as elo',
          'rp.is_host as isHost',
          'rp.joined_at as joinedAt'
        ])
        .orderBy('rp.joined_at', 'asc');
      
      return {
        ...room,
        settings: typeof room.settings === 'string' ? JSON.parse(room.settings) : (room.settings || {}),
        players: participants
      };
    } catch (error) {
      console.error('Get room error:', error);
      throw new Error('Failed to get room');
    }
  }

  /**
   * Get all active rooms
   */
  async getAllRooms() {
    try {
      const rooms = await db('rooms')
        .where({ status: 'waiting' })
        .orderBy('created_at', 'desc');
      
      // Get participant counts for each room
      const roomsWithPlayers = await Promise.all(
        rooms.map(async (room) => {
          const participants = await db('room_participants as rp')
            .join('users as u', 'rp.user_id', 'u.user_id')
            .where({ 'rp.room_id': room.room_id })
            .select([
              'u.user_id as id',
              'u.username as name',
              'u.elo_rating as elo',
              'rp.is_host as isHost',
              'rp.joined_at as joinedAt'
            ]);
          
          return {
            ...room,
            settings: typeof room.settings === 'string' ? JSON.parse(room.settings) : (room.settings || {}),
            players: participants
          };
        })
      );
      
      return roomsWithPlayers;
    } catch (error) {
      console.error('Get all rooms error:', error);
      throw new Error('Failed to get rooms');
    }
  }

  /**
   * Update room status
   */
  async updateRoomStatus(roomId, status) {
    try {
      await db('rooms')
        .where({ room_id: roomId })
        .update({ 
          status,
          last_activity: db.fn.now()
        });
    } catch (error) {
      console.error('Update room status error:', error);
      throw new Error('Failed to update room status');
    }
  }

  /**
   * Clean up empty/inactive rooms
   */
  async cleanupRooms() {
    try {
      // Delete empty rooms older than 5 minutes
      const emptyRoomsDeleted = await db('rooms')
        .where({ current_players: 0 })
        .where('last_activity', '<', db.raw("NOW() - INTERVAL '5 minutes'"))
        .delete();
      
      // Delete inactive rooms older than 30 minutes
      const inactiveRoomsDeleted = await db('rooms')
        .where('last_activity', '<', db.raw("NOW() - INTERVAL '30 minutes'"))
        .where({ status: 'waiting' })
        .delete();
      
      console.log(`Cleanup: Deleted ${emptyRoomsDeleted} empty rooms and ${inactiveRoomsDeleted} inactive rooms`);
      
      return {
        emptyRoomsDeleted,
        inactiveRoomsDeleted
      };
    } catch (error) {
      console.error('Room cleanup error:', error);
    }
  }

  /**
   * Check if user is in any room
   */
  async getUserCurrentRoom(userId) {
    try {
      const participant = await db('room_participants as rp')
        .join('rooms as r', 'rp.room_id', 'r.room_id')
        .where({ 'rp.user_id': userId })
        .whereIn('r.status', ['waiting', 'active'])
        .select('r.room_id')
        .first();
      
      return participant ? participant.room_id : null;
    } catch (error) {
      console.error('Get user current room error:', error);
      return null;
    }
  }
}

module.exports = new RoomService();
# Phase 3.5: QuantGuide Problem Synchronization System

## Overview

Phase 3.5 enhances QuantRooms by implementing a complete problem synchronization system that crawls and maintains a database of all 1,211+ QuantGuide problems. This replaces the mock problem system with real, verified problems for competitive gameplay.

## Current Status

### ✅ Completed (Phase 3)
- Game state management with voting system
- Answer submission detection and validation
- Real-time scoring and ELO calculation
- Mock problem selection for voting

### 🚧 Phase 3.5 Goals
1. **Problem Database**: Store all QuantGuide problems locally
2. **Web Crawler**: Automated system to fetch problem data
3. **Synchronization**: Keep problem database up-to-date
4. **Dynamic Selection**: Use real problems for game voting
5. **Verification**: Ensure selected problems are accessible
6. **Problem Analytics**: Track problem usage and success rates

## Technical Discovery

### QuantGuide Structure
- **Total Problems**: 1,211+ problems
- **Organization**: 25 pages with ~50 problems per page
- **Categories**: probability, statistics, finance, pure math, brainteasers
- **Difficulties**: easy, medium, hard
- **Access Levels**: Free and Premium problems
- **URL Pattern**: `/questions?page=X` for lists, `/questions/[url-ending]` for individual problems

### Problem Data Model
```javascript
{
  "id": "pjSCKiq39SvESirmwFq4",          // Unique QuantGuide ID
  "title": "Place or Take",               // Problem title
  "difficulty": "hard",                   // easy/medium/hard
  "topic": "probability",                 // Main category
  "isPremium": false,                     // Premium access required
  "companies": [{"company": "Jane Street"}], // Associated companies
  "tags": [{"tag": "Games"}, {"tag": "Expected Value"}], // Problem tags
  "urlEnding": "place-or-take"           // URL slug
}
```

## Implementation Plan

### 1. Database Schema

#### Problems Table
```sql
-- Migration: 010_create_problems_table.js
CREATE TABLE problems (
  problem_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quantguide_id VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  topic VARCHAR(50) NOT NULL,
  is_premium BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  companies JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  url_ending VARCHAR(255) NOT NULL,
  full_url VARCHAR(500) NOT NULL,
  crawled_at TIMESTAMP NOT NULL,
  last_verified TIMESTAMP,
  times_used INTEGER DEFAULT 0,
  times_solved INTEGER DEFAULT 0,
  avg_solve_time INTEGER, -- seconds
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_problems_difficulty ON problems(difficulty);
CREATE INDEX idx_problems_topic ON problems(topic);
CREATE INDEX idx_problems_active ON problems(is_active);
CREATE INDEX idx_problems_premium ON problems(is_premium);
CREATE INDEX idx_problems_quantguide_id ON problems(quantguide_id);
```

#### Problem History Table
```sql
-- Migration: 011_create_problem_history_table.js
CREATE TABLE problem_history (
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id UUID REFERENCES problems(problem_id),
  game_id UUID REFERENCES games(game_id),
  selected_by_votes INTEGER NOT NULL,
  total_votes INTEGER NOT NULL,
  players_attempted INTEGER DEFAULT 0,
  players_solved INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track which problems were offered in voting
CREATE TABLE problem_voting_options (
  option_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(game_id),
  problem_id UUID REFERENCES problems(problem_id),
  votes_received INTEGER DEFAULT 0,
  was_selected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Web Crawler Implementation

#### Crawler Service (`/server/services/problemCrawlerService.js`)
```javascript
const puppeteer = require('puppeteer');
const db = require('../database/connection');

class ProblemCrawlerService {
  constructor() {
    this.baseUrl = 'https://quantguide.io';
    this.totalPages = 25;
    this.problemsPerPage = 50;
  }

  async crawlAllProblems() {
    const browser = await puppeteer.launch({ headless: true });
    const allProblems = [];
    
    try {
      for (let page = 1; page <= this.totalPages; page++) {
        console.log(`Crawling page ${page}/${this.totalPages}...`);
        const problems = await this.crawlPage(browser, page);
        allProblems.push(...problems);
        
        // Rate limiting - wait between pages
        await this.delay(2000);
      }
      
      // Save to database
      await this.saveProblems(allProblems);
      
      return {
        success: true,
        totalCrawled: allProblems.length,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Crawler error:', error);
      throw error;
    } finally {
      await browser.close();
    }
  }

  async crawlPage(browser, pageNumber) {
    const page = await browser.newPage();
    await page.goto(`${this.baseUrl}/questions?page=${pageNumber}`, {
      waitUntil: 'networkidle2'
    });
    
    // Extract problems from page
    const problems = await page.evaluate(() => {
      // Find the React/Next.js data
      const scripts = Array.from(document.querySelectorAll('script'));
      let problemData = [];
      
      // Parse inline JSON data
      scripts.forEach(script => {
        const content = script.textContent;
        if (content && content.includes('questions') && content.includes('difficulty')) {
          try {
            // Extract JSON data from script
            const jsonMatch = content.match(/\{.*"questions".*\}/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[0]);
              if (data.questions) {
                problemData = data.questions;
              }
            }
          } catch (e) {}
        }
      });
      
      return problemData;
    });
    
    await page.close();
    return problems;
  }

  async saveProblems(problems) {
    const trx = await db.transaction();
    
    try {
      for (const problem of problems) {
        await trx('problems')
          .insert({
            quantguide_id: problem.id,
            title: problem.title,
            difficulty: problem.difficulty.toLowerCase(),
            topic: problem.topic,
            is_premium: problem.isPremium || false,
            companies: JSON.stringify(problem.companies || []),
            tags: JSON.stringify(problem.tags || []),
            url_ending: problem.urlEnding,
            full_url: `${this.baseUrl}/questions/${problem.urlEnding}`,
            crawled_at: db.fn.now()
          })
          .onConflict('quantguide_id')
          .merge({
            title: problem.title,
            difficulty: problem.difficulty.toLowerCase(),
            topic: problem.topic,
            is_premium: problem.isPremium || false,
            companies: JSON.stringify(problem.companies || []),
            tags: JSON.stringify(problem.tags || []),
            updated_at: db.fn.now()
          });
      }
      
      await trx.commit();
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  async verifyProblem(problemId) {
    const problem = await db('problems')
      .where({ problem_id: problemId })
      .first();
    
    if (!problem) return false;
    
    // Quick HTTP check to verify URL is accessible
    try {
      const response = await fetch(problem.full_url, { method: 'HEAD' });
      const isActive = response.status === 200;
      
      await db('problems')
        .where({ problem_id: problemId })
        .update({
          is_active: isActive,
          last_verified: db.fn.now()
        });
      
      return isActive;
    } catch (error) {
      return false;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ProblemCrawlerService();
```

### 3. Updated Game Service

#### Enhanced Problem Selection (`/server/services/gameService.js`)
```javascript
// Update the getRandomProblems method
async getRandomProblems(count, difficulty, excludePremium = true) {
  try {
    // Build query
    let query = db('problems')
      .where('is_active', true)
      .orderBy(db.raw('RANDOM()'))
      .limit(count);
    
    // Apply filters
    if (difficulty && difficulty !== 'all') {
      query = query.where('difficulty', difficulty.toLowerCase());
    }
    
    if (excludePremium) {
      query = query.where('is_premium', false);
    }
    
    const problems = await query;
    
    // Transform to game format
    return problems.map(p => ({
      id: p.quantguide_id,
      title: p.title,
      difficulty: p.difficulty,
      topic: p.topic,
      url: p.full_url,
      dbId: p.problem_id // Keep reference for tracking
    }));
  } catch (error) {
    console.error('Error fetching problems:', error);
    // Fallback to mock problems if database fails
    return this.getMockProblems(count);
  }
}

// Track problem usage
async recordProblemUsage(gameId, problems, selectedProblemId) {
  const trx = await db.transaction();
  
  try {
    // Record all voting options
    for (const problem of problems) {
      const votes = problem.id === selectedProblemId ? 
        Object.values(this.activeGames.get(gameId).votes).filter(v => v === problem.id).length : 0;
      
      await trx('problem_voting_options').insert({
        game_id: gameId,
        problem_id: problem.dbId,
        votes_received: votes,
        was_selected: problem.id === selectedProblemId
      });
    }
    
    // Update problem statistics
    const selectedProblem = problems.find(p => p.id === selectedProblemId);
    if (selectedProblem) {
      await trx('problems')
        .where({ problem_id: selectedProblem.dbId })
        .increment('times_used', 1);
      
      await trx('problem_history').insert({
        problem_id: selectedProblem.dbId,
        game_id: gameId,
        selected_by_votes: Object.values(this.activeGames.get(gameId).votes)
          .filter(v => v === selectedProblemId).length,
        total_votes: Object.keys(this.activeGames.get(gameId).votes).length
      });
    }
    
    await trx.commit();
  } catch (error) {
    await trx.rollback();
    console.error('Error recording problem usage:', error);
  }
}
```

### 4. Crawler Management API

#### Crawler Routes (`/server/routes/problems.js`)
```javascript
const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const crawlerService = require('../services/problemCrawlerService');
const db = require('../database/connection');

// Get problem statistics
router.get('/stats', authenticate, async (req, res) => {
  try {
    const stats = await db('problems')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active'),
        db.raw('SUM(CASE WHEN is_premium THEN 1 ELSE 0 END) as premium'),
        db.raw('COUNT(DISTINCT topic) as topics')
      )
      .first();
    
    const byDifficulty = await db('problems')
      .select('difficulty')
      .count('* as count')
      .groupBy('difficulty');
    
    const lastCrawl = await db('problems')
      .max('crawled_at as last_crawl')
      .first();
    
    res.json({
      success: true,
      data: {
        ...stats,
        byDifficulty,
        lastCrawl: lastCrawl.last_crawl
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manually trigger crawl (admin only)
router.post('/crawl', authenticate, requireAdmin, async (req, res) => {
  try {
    // Check if crawl is already running
    const isRunning = await crawlerService.isRunning();
    if (isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Crawler is already running'
      });
    }
    
    // Start crawl in background
    crawlerService.crawlAllProblems()
      .then(result => {
        console.log('Crawl completed:', result);
      })
      .catch(error => {
        console.error('Crawl failed:', error);
      });
    
    res.json({
      success: true,
      message: 'Crawl started in background'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get problems for filtering/browsing
router.get('/browse', authenticate, async (req, res) => {
  try {
    const { 
      difficulty, 
      topic, 
      page = 1, 
      limit = 50,
      excludePremium = true 
    } = req.query;
    
    let query = db('problems').where('is_active', true);
    
    if (difficulty) {
      query = query.where('difficulty', difficulty);
    }
    
    if (topic) {
      query = query.where('topic', topic);
    }
    
    if (excludePremium === 'true') {
      query = query.where('is_premium', false);
    }
    
    const offset = (page - 1) * limit;
    const problems = await query
      .orderBy('title')
      .limit(limit)
      .offset(offset);
    
    const total = await query.count('* as count').first();
    
    res.json({
      success: true,
      data: {
        problems,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total.count,
          pages: Math.ceil(total.count / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

### 5. Scheduled Synchronization

#### Cron Job Setup (`/server/services/scheduler.js`)
```javascript
const cron = require('node-cron');
const crawlerService = require('./problemCrawlerService');

class Scheduler {
  start() {
    // Daily crawl at 3 AM
    cron.schedule('0 3 * * *', async () => {
      console.log('Starting scheduled problem crawl...');
      try {
        const result = await crawlerService.crawlAllProblems();
        console.log('Scheduled crawl completed:', result);
      } catch (error) {
        console.error('Scheduled crawl failed:', error);
      }
    });
    
    // Hourly verification of recently used problems
    cron.schedule('0 * * * *', async () => {
      console.log('Verifying recently used problems...');
      try {
        const recentProblems = await db('problems')
          .whereNotNull('last_verified')
          .where('last_verified', '>', db.raw("NOW() - INTERVAL '24 hours'"))
          .limit(50);
        
        for (const problem of recentProblems) {
          await crawlerService.verifyProblem(problem.problem_id);
        }
      } catch (error) {
        console.error('Problem verification failed:', error);
      }
    });
  }
}

module.exports = new Scheduler();
```

### 6. Content Script Enhancement

#### Problem Verification (`/extension/content.js`)
```javascript
// Add to extractProblemData method
async verifyProblemWithServer() {
  if (!this.problemData || !this.problemData.problemId) return;
  
  try {
    // Send verification to background script
    chrome.runtime.sendMessage({
      type: 'VERIFY_PROBLEM',
      problemData: this.problemData
    });
  } catch (error) {
    console.error('Problem verification error:', error);
  }
}

// Add to problem detection
detectProblemPage() {
  // ... existing code ...
  
  if (isProblemPage) {
    console.log('QuantRooms: Problem page detected');
    this.extractProblemData();
    this.verifyProblemWithServer(); // New: verify with server
  }
}
```

### 7. Installation & Setup

#### Dependencies
```json
// package.json additions
{
  "dependencies": {
    "puppeteer": "^21.0.0",
    "node-cron": "^3.0.2"
  }
}
```

#### Initial Setup Commands
```bash
# Install dependencies
npm install puppeteer node-cron

# Run migrations
npm run migrate

# Initial crawl (run once after setup)
node -e "require('./services/problemCrawlerService').crawlAllProblems()"
```

### 8. Configuration

#### Environment Variables
```env
# Crawler Configuration
CRAWLER_ENABLED=true
CRAWLER_RATE_LIMIT_MS=2000
CRAWLER_TIMEOUT_MS=30000
CRAWLER_MAX_RETRIES=3

# Problem Selection
EXCLUDE_PREMIUM_PROBLEMS=true
MIN_PROBLEMS_PER_DIFFICULTY=50
PROBLEM_CACHE_DURATION_HOURS=24
```

## Testing Strategy

### 1. Crawler Testing
- Test pagination handling
- Verify data extraction accuracy
- Test error recovery and retries
- Validate rate limiting

### 2. Problem Selection Testing
- Test filtering by difficulty/topic
- Verify random selection distribution
- Test fallback to mock problems
- Validate premium problem exclusion

### 3. Integration Testing
- Full game flow with real problems
- Verify problem URLs open correctly
- Test problem verification system
- Validate statistics tracking

## Rollout Plan

### Phase 1: Infrastructure (Week 1)
1. Create database migrations
2. Implement crawler service
3. Set up scheduled jobs
4. Deploy crawler to production

### Phase 2: Initial Crawl (Week 2)
1. Run full crawl of QuantGuide
2. Verify data integrity
3. Test problem selection
4. Monitor crawler performance

### Phase 3: Integration (Week 3)
1. Update game service to use real problems
2. Implement problem verification
3. Add management API endpoints
4. Deploy to production

### Phase 4: Optimization (Week 4)
1. Fine-tune crawler performance
2. Implement caching strategies
3. Add analytics dashboard
4. Monitor usage patterns

## Success Metrics

- **Coverage**: 95%+ of QuantGuide problems in database
- **Freshness**: Problems verified within 24 hours
- **Availability**: 99%+ uptime for problem selection
- **Performance**: <100ms problem selection time
- **Accuracy**: <1% invalid problem selections

## Future Enhancements

1. **Smart Problem Selection**
   - ML-based difficulty estimation
   - User preference learning
   - Balanced problem distribution

2. **Problem Analytics**
   - Success rate by problem
   - Average solve times
   - Difficulty calibration

3. **Community Features**
   - User-submitted problems
   - Problem ratings
   - Solution discussions

4. **Advanced Filtering**
   - Company-specific problems
   - Topic combinations
   - Custom problem sets

## Security Considerations

1. **Rate Limiting**: Respect QuantGuide's servers
2. **Data Privacy**: Don't store problem solutions
3. **Access Control**: Admin-only crawler endpoints
4. **Error Handling**: Graceful fallbacks

## Maintenance

### Daily Tasks
- Monitor crawler logs
- Check problem verification status
- Review error reports

### Weekly Tasks
- Analyze problem usage statistics
- Review crawler performance
- Update problem metadata

### Monthly Tasks
- Full database verification
- Performance optimization
- Feature updates based on usage

This comprehensive system will provide QuantRooms with a robust, scalable solution for real-time problem selection using actual QuantGuide problems.
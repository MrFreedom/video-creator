import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// CORS для n8n
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Главная страница
app.get('/', (req, res) => {
  res.json({
    service: 'Video Creator API',
    status: 'online',
    endpoint: 'POST /create-video',
    usage: 'Send { images: ["url1", "url2"], durations: [3, 5] }'
  });
});

// Создание видео
app.post('/create-video', async (req, res) => {
  console.log('📨 Video creation request received');
  
  try {
    const { images, durations } = req.body;
    
    // Валидация
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }
    
    // Лимит 5 слайдов для бесплатного тарифа
    const imagesToUse = images.slice(0, 5);
    const durationsToUse = durations ? durations.slice(0, 5) : 
      imagesToUse.map((_, i) => i === 0 ? 3 : 5);
    
    console.log(`Creating video from ${imagesToUse.length} slides`);
    
    // Скачиваем изображения
    const imagePaths = [];
    for (let i = 0; i < imagesToUse.length; i++) {
      try {
        console.log(`Downloading image ${i + 1}`);
        const response = await axios({
          url: imagesToUse[i],
          responseType: 'arraybuffer',
          timeout: 30000
        });
        
        const imagePath = join(__dirname, `temp_${Date.now()}_${i}.jpg`);
        fs.writeFileSync(imagePath, response.data);
        imagePaths.push(imagePath);
      } catch (err) {
        console.error(`Failed to download image ${i + 1}:`, err.message);
      }
    }
    
    if (imagePaths.length === 0) {
      return res.status(400).json({ error: 'Failed to download any images' });
    }
    
    // Создаем видео
    const outputPath = join(__dirname, `video_${Date.now()}.mp4`);
    
    return new Promise((resolve, reject) => {
      console.log('Starting FFmpeg processing...');
      
      const command = ffmpeg();
      
      // Добавляем изображения
      imagePaths.forEach(path => {
        command.input(path);
      });
      
      // Настройки
      command
        .outputOptions([
          '-framerate 1/5',
          '-pattern_type glob',
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-preset ultrafast',
          '-crf 28',
          '-r 30',
          '-shortest'
        ])
        .output(outputPath)
        .on('start', (cmd) => {
          console.log('FFmpeg started');
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log('✅ Video created successfully');
          
          const videoBuffer = fs.readFileSync(outputPath);
          
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
          res.send(videoBuffer);
          
          // Очистка
          imagePaths.forEach(p => { try { fs.unlinkSync(p); } catch(e) {} });
          try { fs.unlinkSync(outputPath); } catch(e) {}
          
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err.message);
          reject(err);
        })
        .run();
    });
    
  } catch (error) {
    console.error('Server error:', error.message);
    res.status(500).json({ 
      error: 'Video creation failed', 
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

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

// Разрешаем n8n стучаться к нам
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/', (req, res) => res.send('Server is running'));

app.post('/create-video', async (req, res) => {
  console.log('📨 Request received');
  const { images, durations } = req.body;
  
  if (!images || !Array.isArray(images)) {
    return res.status(400).send('No images provided');
  }

  const imagePaths = [];
  const outputPath = join(__dirname, `video_${Date.now()}.mp4`);

  try {
    // 1. Качаем картинки. Если одна не качается — всё видео не упадет.
    for (let i = 0; i < images.length; i++) {
      try {
        console.log(`Downloading: ${images[i]}`);
        const response = await axios({ 
          url: images[i], 
          responseType: 'arraybuffer', 
          timeout: 25000 
        });
        const p = join(__dirname, `temp_${Date.now()}_${i}.jpg`);
        fs.writeFileSync(p, response.data);
        imagePaths.push(p);
      } catch (err) {
        console.log(`Skip image ${i} due to error`);
      }
    }

    if (imagePaths.length === 0) throw new Error('Zero images downloaded');

    // 2. Ебашим видео. Настройки максимально "дубовые", чтобы не падали.
    const command = ffmpeg();
    
    imagePaths.forEach((path) => {
      command.input(path).loop(5); // Каждый слайд по 5 сек
    });

    command
      .fps(25)
      .allowDirectStreamConfig(false)
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset ultrafast',
        '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2'
      ])
      .on('error', (err) => {
        console.error('FFmpeg Error:', err.message);
        if (!res.headersSent) res.status(500).send(err.message);
      })
      .on('end', () => {
        console.log('✅ Video Created!');
        res.download(outputPath, (err) => {
          // Чистим мусор за собой
          imagePaths.forEach(p => { if(fs.existsSync(p)) fs.unlinkSync(p) });
          if(fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });
      })
      .mergeToFile(outputPath, __dirname);

  } catch (e) {
    console.error('General Error:', e.message);
    if (!res.headersSent) res.status(500).send(e.message);
    imagePaths.forEach(p => { if(fs.existsSync(p)) fs.unlinkSync(p) });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));

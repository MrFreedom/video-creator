app.post('/create-video', async (req, res) => {
  console.log('📨 Request received');
  const { images, durations } = req.body;
  
  if (!images || !Array.isArray(images)) return res.status(400).send('No images');

  const imagePaths = [];
  const outputPath = join(__dirname, `video_${Date.now()}.mp4`);

  try {
    // 1. Скачиваем картинки (увеличил таймаут до 30с для Cloudinary)
    for (let i = 0; i < images.length; i++) {
      const response = await axios({ url: images[i], responseType: 'arraybuffer', timeout: 30000 });
      const p = join(__dirname, `temp_${Date.now()}_${i}.jpg`);
      fs.writeFileSync(p, response.data);
      imagePaths.push(p);
    }

    // 2. Сборка видео (БЕЗ глючных глобов и паттернов)
    const command = ffmpeg();
    
    imagePaths.forEach((path, i) => {
      // Ставим длительность для каждого слайда отдельно
      command.input(path).loop(durations[i] || 5); 
    });

    command
      .allowDirectStreamConfig(false)
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset ultrafast',
        '-r 25',
        '-vf scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2'
      ])
      .on('error', (err) => {
        console.error('FFmpeg Error:', err.message);
        res.status(500).send(err.message);
      })
      .on('end', () => {
        console.log('✅ Success!');
        res.download(outputPath, () => {
          imagePaths.forEach(p => fs.unlinkSync(p));
          fs.unlinkSync(outputPath);
        });
      })
      .mergeToFile(outputPath, __dirname); // Используем merge для стабильности

  } catch (e) {
    console.error('General Error:', e.message);
    res.status(500).send(e.message);
    imagePaths.forEach(p => fs.unlinkSync(p));
  }
});

import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

// Главная страница, чтобы видеть, что сервер живой
app.get('/', (req, res) => res.send('SERVER IS READY ✅'));

app.post('/create-video', async (req, res) => {
    console.log('📨 Получен запрос на создание видео...');
    const { images } = req.body;
    
    if (!images || !Array.isArray(images)) {
        return res.status(400).send('Ошибка: Данные images должны быть массивом.');
    }

    const timestamp = Date.now();
    const workDir = path.resolve();
    const outputPath = path.join(workDir, `final_${timestamp}.mp4`);
    const listPath = path.join(workDir, `list_${timestamp}.txt`);
    const downloadedPaths = [];

    try {
        // 1. Скачивание изображений
        for (let i = 0; i < images.length; i++) {
            console.log(`Скачивание файла ${i}...`);
            const response = await axios({ 
                url: images[i], 
                responseType: 'arraybuffer', 
                timeout: 30000 
            });
            const p = path.join(workDir, `file_${timestamp}_${i}.jpg`);
            fs.writeFileSync(p, response.data);
            downloadedPaths.push(p);
        }

        // 2. Создание файла-списка для FFmpeg (гарантирует длительность)
        let listContent = '';
        downloadedPaths.forEach(p => {
            listContent += `file '${p}'\nduration 5\n`;
        });
        // Специфика concat: последний файл нужно продублировать без duration
        listContent += `file '${downloadedPaths[downloadedPaths.length - 1]}'`;
        fs.writeFileSync(listPath, listContent);

        console.log('🎬 Запуск FFmpeg (ultrafast режим)...');
        
        ffmpeg()
            .input(listPath)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions([
                '-c:v libx264',           // Кодек
                '-pix_fmt yuv420p',       // Формат для совместимости
                '-preset ultrafast',      // Максимальная скорость сборки
                '-r 25',                  // Частота кадров
                '-movflags +faststart'    // Метаданные в начало (убирает 0 секунд)
            ])
            .on('error', (err) => {
                console.error('Ошибка FFmpeg:', err.message);
                if (!res.headersSent) res.status(500).send(err.message);
            })
            .on('end', () => {
                console.log('✅ Видео готово к отправке!');
                res.download(outputPath, (err) => {
                    if (err) console.error('Ошибка при отправке файла:', err);
                    
                    // Удаляем временные файлы
                    downloadedPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
                    if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    console.log('🧹 Временные файлы удалены.');
                });
            })
            .save(outputPath);

    } catch (e) {
        console.error('Критическая ошибка:', e.message);
        if (!res.headersSent) res.status(500).send(e.message);
        downloadedPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
        if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));

const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const upload = multer({ dest: 'uploads/' }); // temp folder for uploads

app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend'))); // ? serve static frontend files

// Initialize SQLite DB
const db = new sqlite3.Database(path.join(__dirname, '../database/files.db'), (err) => {
  if (err) {
    console.error('Could not connect to SQLite DB:', err);
  } else {
    console.log('Connected to SQLite database.');
  }
});


// Initialize S3 client
const s3 = new S3Client({ region: 'us-east-1' });

// Your S3 bucket name
const BUCKET_NAME = 'storagebucket-o';

// Upload route
app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send('No file uploaded');
  }

  try {
    // Check if file with same s3_key already exists
    db.get('SELECT * FROM files WHERE s3_key = ?', [file.originalname], async (err, row) => {
      if (err) {
        console.error('DB select error:', err);
        return res.status(500).send('Database error');
      }

      if (row) {
        // File already exists
        // Delete temp uploaded file since we're not uploading again
        fs.unlink(file.path, () => {});
        return res.status(400).send('File with the same name already uploaded');
      } else {
        // Upload file to S3
        const fileStream = fs.createReadStream(file.path);
        const uploadParams = {
          Bucket: BUCKET_NAME,
          Key: file.originalname,
          Body: fileStream,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        // Insert metadata into SQLite DB
        const sql = `
          INSERT INTO files (filename, s3_key, mimetype, size)
          VALUES (?, ?, ?, ?)
        `;
        const params = [file.originalname, file.originalname, file.mimetype, file.size];

        db.run(sql, params, (err) => {
          // Delete temp file after upload
          fs.unlink(file.path, () => {});

          if (err) {
            console.error('DB insert error:', err);
            return res.status(500).send('Failed to save file metadata');
          }

          res.send('File uploaded and metadata saved successfully!');
        });
      }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).send('Error uploading file');
  }
});



// Get uploaded files metadata
app.get('/files', async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM files ORDER BY upload_date DESC");

    const filesWithUrls = rows.map(row => ({
      ...row,
      s3_url: `https://${bucketName}.s3.amazonaws.com/${row.s3_key}`
    }));

    res.json(filesWithUrls);
  } catch (err) {
    console.error('DB read error:', err);
    res.status(500).send('Database error');
  }
});

//Delete

app.delete('/delete/:id', async (req, res) => {
  const fileId = req.params.id;

  try {
    // Get the file info from DB
    const file = await db.get("SELECT * FROM files WHERE id = ?", [fileId]);
    if (!file) return res.status(404).send("File not found");

    // Delete file from S3
    await s3.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: file.s3_key,
    }));

    // Delete file from DB
    await db.run("DELETE FROM files WHERE id = ?", [fileId]);

    res.send("File deleted successfully");
  } catch (err) {
    console.error("Error deleting file:", err);
    res.status(500).send("Failed to delete file");
  }
});



// Start server on 0.0.0.0 to be accessible from outside
app.listen(3000, '0.0.0.0', () => {
  console.log('Server running at http://0.0.0.0:3000');
});





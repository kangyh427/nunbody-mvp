CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  cloudinary_id TEXT NOT NULL,
  body_part VARCHAR(20) DEFAULT 'full',
  taken_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  analysis_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_taken ON photos(user_id, taken_at DESC);

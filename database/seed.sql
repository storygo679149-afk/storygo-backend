-- Database seed file for initial data
-- Inserts essential categories, subscription plans, and admin user

-- Insert default categories
INSERT INTO categories (name, description, slug, display_order) VALUES
('Action & Adventure', 'Thrilling stories full of action and adventure', 'action-adventure', 1),
('Romance', 'Love stories that capture the heart', 'romance', 2),
('Horror', 'Chilling tales that keep you on edge', 'horror', 3),
('Science Fiction', 'Futuristic stories exploring new frontiers', 'science-fiction', 4),
('Fantasy', 'Magical worlds and mythical creatures', 'fantasy', 5),
('Mystery & Thriller', 'Suspenseful stories that keep you guessing', 'mystery-thriller', 6),
('Comedy', 'Light-hearted stories that make you laugh', 'comedy', 7),
('Drama', 'Emotional and character-driven narratives', 'drama', 8),
('Historical Fiction', 'Stories set in important historical periods', 'historical-fiction', 9),
('Self-Help', 'Motivational and personal development content', 'self-help', 10)
ON CONFLICT (slug) DO NOTHING;

-- Insert subscription plans
INSERT INTO subscription_plans (name, price_amount, currency, interval) VALUES
('Monthly Premium', 4000, 'inr', 'month'),
('Yearly Premium', 40000, 'inr', 'year')
ON CONFLICT DO NOTHING;

-- Pre‑defined admin account (password: Krishna.12)
-- bcrypt hash for 'Krishna.12' (12 rounds)
INSERT INTO users (username, email, password_hash, full_name, is_admin, is_creator) VALUES
('admin', 'Krishna123@gmail.com',
 '$2b$12$r9YAdm9sU16ZS0c7yJw01.9qNak2kv7zu4tgzLKvqk.BWzOd851BG',
 'Platform Admin', true, false)
ON CONFLICT (email) DO NOTHING;
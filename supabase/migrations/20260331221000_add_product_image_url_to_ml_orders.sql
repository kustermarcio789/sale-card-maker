ALTER TABLE public.ml_orders
ADD COLUMN IF NOT EXISTS product_image_url TEXT;

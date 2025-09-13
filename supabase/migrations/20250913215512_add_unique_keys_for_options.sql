-- 去重：以 ctid 排序保留第一筆（避免已有重複造成唯一鍵無法建立）
WITH ranked_cat AS (
  SELECT ctid, category_id, option_id,
         ROW_NUMBER() OVER (PARTITION BY category_id, option_id ORDER BY ctid) AS rn
  FROM public.category_options
), to_del_cat AS (SELECT ctid FROM ranked_cat WHERE rn > 1)
DELETE FROM public.category_options WHERE ctid IN (SELECT ctid FROM to_del_cat);

WITH ranked_item AS (
  SELECT ctid, item_id, option_id,
         ROW_NUMBER() OVER (PARTITION BY item_id, option_id ORDER BY ctid) AS rn
  FROM public.item_options
), to_del_item AS (SELECT ctid FROM ranked_item WHERE rn > 1)
DELETE FROM public.item_options WHERE ctid IN (SELECT ctid FROM to_del_item);

-- 建立唯一鍵（若不存在才建立）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'category_options_category_id_option_id_key'
      AND conrelid = 'public.category_options'::regclass
  ) THEN
    ALTER TABLE public.category_options
      ADD CONSTRAINT category_options_category_id_option_id_key
      UNIQUE (category_id, option_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'item_options_item_id_option_id_key'
      AND conrelid = 'public.item_options'::regclass
  ) THEN
    ALTER TABLE public.item_options
      ADD CONSTRAINT item_options_item_id_option_id_key
      UNIQUE (item_id, option_id);
  END IF;
END
$$ LANGUAGE plpgsql;

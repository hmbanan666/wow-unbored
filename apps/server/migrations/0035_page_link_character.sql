-- Optional last-played Character bound to a one-time Companion sign-in link.
ALTER TABLE web.sign_in_links ADD COLUMN character text;

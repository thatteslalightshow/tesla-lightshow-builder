-- Song title + artist for richer gallery cards (read from MP3 ID3 tags)
alter table shows add column if not exists song_title  text;
alter table shows add column if not exists song_artist text;

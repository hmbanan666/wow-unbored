# 0020. Player history on the Server

Status: accepted

The addon keeps a rolling profile snapshot updated by game events and only stamps the time at logout; the Server never overwrites a good field with an empty one. The Server keeps dated Player history per character (Requests, Answers, Plans, progress, profile snapshots), ready for a future player website, and stores Personal advice through `put_item_advice` for the Companion to download (D37-D39).

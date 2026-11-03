# 0065. Friendly Plans and destination points

Status: accepted

Plans speak directly to the player: one-line action titles, at most two short sentences per Step note, continent or expansion labels for places on another continent, and at most one joke, without explaining evidence or rejected choices. Order Steps from what is closest to the player; a travel point is the destination or is omitted, never copied from the Request's position. When `put_plan` receives a Request, the Server drops a Step's point on the same map within 0.005 on each axis of that position and returns a warning while keeping the Step; without Player context, points are unchanged.

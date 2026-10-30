# 0036. Prefetch contents and budget

Status: accepted

The Companion writes only the Full plan offer (with `entities`), Request status with `eta`, Personal advice (at most 500 items) and an Account digest of Alts seen on other PCs into `Unbored_Plan`, within 200 KB and fewer than 20k literals (D76). Calendar and events digests are not prefetched in 0.7; the addon reads the calendar itself.

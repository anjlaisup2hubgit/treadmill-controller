# Connection

Header status text + Connect/Disconnect button (#status, #connectBtn).

- Filters Bluetooth picker to FTMS devices
- Requests control point access on connect
- Auto-reconnects with backoff (1,2,4,8,16 s, 5 attempts)
- Disables itself if Web Bluetooth/secure context is unavailable


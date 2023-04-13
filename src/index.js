import * as dotenv from 'dotenv'
dotenv.config()

import http from 'node:http'
import querystring from 'node:querystring'
import GPIO from 'rpi-gpio'

GPIO.on('change', (channel, value) => {
  console.log(`[DEBUG] Channel ${channel} is now ${value}.`)
})

const host = process.env.HTTP_HOST ?? 'localhost'
const port = parseInt(process.env.HTTP_PORT) ?? 8000
const allowedGPIO = [3, 5, 7]
const enabledGPIO = allowedGPIO

const gpioMap = {}

const requestListener = function (req, res) {
  const unparsedQuery = req.path.split('?')
  if (unparsedQuery.length <= 1) return invalidRequest(req, res)
  const query = querystring.parse(unparsedQuery[1])

  if (!query.pin || !allowedGPIO.includes(query.pin)) return invalidRequest(req, res)

  const inverted = !gpioMap[query.pin]
  GPIO.write(query.pin, inverted ? GPIO.DIR_HIGH : GPIO.DIR_LOW, (error) => {
    gpioMap[query.pin] = inverted
    if (error) {
      gpioMap[query.pin] = !inverted
      throw error
    }

    if (query.timeout && parseInt(query.timeout)) {
      setTimeout(() => {
        GPIO.write(query.pin, inverted ? GPIO.DIR_HIGH : GPIO.DIR_LOW, (error) => {
          if (error) throw error
          gpioMap[query.pin] = false
        })
      }, query.timeout)
    }
  })

  res.writeHead(204);
  return res.end();
};

function invalidRequest (req, res) {
  res.writeHead(400)
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify({ error: 'no query pin supplied' }))
}

const server = http.createServer(requestListener);
server.listen(port, host, () => {
  for (const pin of enabledGPIO) {
    gpioMap[pin] = false
    GPIO.setup(pin, GPIO.DIR_OUT, GPIO.EDGE_NONE, (error, idk) => {
      if (error) throw error
      console.log(`[DEBUG] Setup channel ${pin} finished. ${idk}`)
    })
  }
  console.log(`Server is running on http://${host}:${port}`);
});

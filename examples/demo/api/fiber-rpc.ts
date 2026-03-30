export default async function handler(req, res) {
    const response = await fetch('http://18.163.221.211:8227/', {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    })
  
    const data = await response.json()
    res.status(response.status).json(data)
  }
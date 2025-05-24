# Start the first command prompt and run the Python server
Start-Process "cmd.exe" -ArgumentList "/k python3 server.py"

# Wait for a few seconds to allow ngrok to start and create the URL
Start-Sleep -Seconds 5

# Start the second command prompt and run ngrok
Start-Process "cmd.exe" -ArgumentList "/k ngrok http http://127.0.0.1:5001"
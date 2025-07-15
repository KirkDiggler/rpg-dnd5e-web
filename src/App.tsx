import './App.css'

function App() {
  return (
    <div className="App">
      <h1>RPG D&D 5e Web</h1>
      <p>Welcome to the D&D 5e Discord Activity!</p>
      <div style={{ marginTop: '2rem' }}>
        <p>Environment: {import.meta.env.MODE}</p>
        <p>API Host: {import.meta.env.VITE_API_HOST || 'Not configured'}</p>
      </div>
    </div>
  )
}

export default App
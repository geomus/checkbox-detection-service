const App = () => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <h1 className="text-lg font-semibold">Checkbox Detection</h1>
          <p className="text-sm text-gray-500">Upload a scanned form and see every checkbox it finds, filled or empty.</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-xl font-semibold">Start with a document</h2>
          <p className="mt-2 text-sm text-gray-500">
            Drop a JPEG or PNG of an appraisal form. The detector marks each checkbox and says whether it is checked.
          </p>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4 text-sm text-gray-500">
          {new Date().getFullYear()} - Built by{' '}
          <a
            href="https://github.com/geomus"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary hover:underline"
          >
            Nahuel Daneri
          </a>
        </div>
      </footer>
    </div>
  )
}

export default App

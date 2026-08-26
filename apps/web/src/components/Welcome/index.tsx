import HVLogo from '../../assets/logos/hv.svg'
import ReactLogo from '../../assets/logos/react.svg'
import ViteLogo from '../../assets/logos/vite.svg'

const tags = [
  { name: 'React', logo: ReactLogo },
  { name: 'Vite', logo: ViteLogo },
  { name: 'Typescript' },
  { name: 'Tailwind' },
  { name: 'Eslint' },
  { name: 'Prettier' },
  { name: 'Vitest' },
]

const Welcome = () => (
  <article className=" flex flex-col mt-20 items-center flex-1 text-center">
    <section className="mb-4 w-[70%] h-auto max-w-[350px] min-w-[10px]">
      <img className="w-full" src={HVLogo} alt="HomeVision Logo" />
    </section>
    <section className="flex flex-col gap-4 text-lg items-center">
      <div>
        <h1 className="text-8xl">
          <span className="bg-gradient-to-r from-primary to-rose-500 bg-clip-text text-transparent w-max">HomeVision</span>
        </h1>
        <h2 className="text-5xl text-gray-500">Challenge Template</h2>
      </div>
      <p>This template is provided to help you get started quickly with the challenge.</p>
      <p>You can use it as is, or customize it to suit your needs.</p>
      <p>
        If unsure where to begin take a look at <code className="text-primary">src/pages/app.tsx</code>
      </p>
      <div data-testid="tags" className="flex flex-wrap gap-2 mt-4 px-10">
        {tags.map((tag) => (
          <span key={tag.name} className="bg-primary text-white px-4 py-1 rounded-full text-sm font-semibold flex items-center gap-1" role="listitem">
            {tag.logo && <img className="h-4" src={tag.logo} alt={`${tag.name} Logo`} />}
            <span>{tag.name}</span>
          </span>
        ))}
      </div>
    </section>
  </article>
)

export default Welcome

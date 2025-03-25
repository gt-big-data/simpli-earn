export default function SummaryFrame() {
  return (
    <div className="flex w-full h-full">
      <div className="w-full h-full font-montserrat text-white mt-[40px] justify-center items-center bg-white/4 rounded-[30px] border-t-[0.85px] border-l-[0.85px] border-white/25 relative">
        <div className="absolute h-[70px] w-[calc(100%-100px)] bg-transparent bottom-0 left-0 rounded-b-[30px] border-b-[0.85px] border-r-[0.01px] border-white/25"></div>
        <div className="absolute h-[calc(100%-100px)] w-[70px] bg-transparent top-0 right-0 rounded-tr-[30px] rounded-br-[30px] border-r-[0.85px] border-b-[0.01px] border-white/25"></div>
        <div className="absolute h-[100px] w-[100px] bg-black/50 w-1/2 bottom-0 right-0 rounded-tl-[30px] border-t-[0.85px] border-l-[0.85px] border-white/25">
          <div className="absolute w-[30px] aspect-square bg-[radial-gradient(circle_30px_at_top_left,_transparent_98%,black)] bottom-0 left-[-30px]"></div>
          <div className="absolute w-[30px] aspect-square bg-[radial-gradient(circle_30px_at_top_left,_transparent_98%,black)] right-0 top-[-30px]"></div>
        </div>
        <h1 className="flex justify-center items-start pt-8 font-bold text-lg">Summary</h1>
          <div className="flex flex-col justify-start items-start text-md px-10 py-8">
            <p>
            Ipsum duis deserunt incididunt do aliquip et nostrud elit consectetur consequat in. Et cupidatat cupidatat pariatur mollit consequat ut aliquip commodo duis laboris aliqua cillum nostrud nostrud. 
            Voluptate voluptate sint voluptate ex excepteur culpa minim dolor. Aliqua aute cupidatat est consectetur nisi cillum do non eiusmod adipisicing esse anim est. Proident do sint sint reprehenderit commodo. Reprehenderit ipsum laboris nisi Lorem aliquip laboris amet veniam duis laborum. 
            Et sunt consequat irure officia et eu incididunt deserunt in enim cupidatat enim. Excepteur non proident et est non pariatur mollit. Sunt cupidatat et amet labore incididunt amet ullamco enim cupidatat eu. Occaecat sint deserunt esse sunt est do.
            </p>
            <p className="pt-5">
              Nulla labore velit occaecat. Exercitation anim occaecat eu sit velit Lorem fugiat excepteur. Nisi et laboris eiusmod aliqua irure nisi sit ipsum sunt fugiat. Nostrud laborum velit commodo nostrud exercitation sit commodo amet ea irure tempor nostrud consequat culpa pariatur. Ipsum amet anim esse irure ea eu ipsum mollit sunt eu. Proident quis amet culpa occaecat occaecat proident deserunt dolor est proident voluptate. Do dolore fugiat cillum do occaecat.
            </p>
            <p className="pt-5">
            Irure sunt reprehenderit eu et adipisicing cupidatat eiusmod occaecat quis laborum. Est esse id aute in aliqua aliquip labore adipisicing non excepteur proident ut reprehenderit culpa voluptate. Elit culpa commodo ea nulla irure aliqua dolor. Aliqua est exercitation Lorem sint ullamco irure reprehenderit cillum. Officia commodo fugiat dolor. Culpa sit cupidatat sint aute aute nisi enim consequat nostrud.
            </p>
          </div>
      </div>
    </div>
  );
}

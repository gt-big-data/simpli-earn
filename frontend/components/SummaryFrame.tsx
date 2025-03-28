import { Dispatch, SetStateAction } from "react";
import ChatIcon from "./ChatIcon";
import Image from "next/image";

export default function SummaryFrame({ setExpandedChat }: { setExpandedChat: Dispatch<SetStateAction<boolean>> }) {
  return (
    <div className="flex w-full">
      <div className="w-full font-montserrat text-white mt-[40px] justify-center items-center bg-white/4 rounded-[30px] border-[1.5px] border-white/25 relative">
        <ChatIcon setExpandedChat={setExpandedChat} />
        <div
          className="float-right h-full -ml-[20px] mt-[2.6px] -mr-[2.5px] flex items-end"
          style={{
            shapeOutside: "inset(calc(100% - 110px) 0 0)",
          }}
        >
          <Image src="/inset-corner.svg" alt="" width={144} height={144} />
        </div>
        <div className="p-6">
          <h1 className="font-bold text-lg font-montserrat w-full text-center mb-3">Summary</h1>

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

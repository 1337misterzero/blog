document.addEventListener("DOMContentLoaded",()=>{
  const audio=document.querySelector("#rock-radio");
  const play=document.querySelector("#radio-play");
  const icon=document.querySelector(".radio-play-icon");
  const status=document.querySelector("#radio-status");
  const volume=document.querySelector("#radio-volume");

  if(!audio || !play || !icon || !status || !volume){
    return;
  }

  const mainStream="https://ice5.somafm.com/metal-128-mp3";
  const altStream="https://ice2.somafm.com/metal-128-mp3";

  const savedVolume=Number(localStorage.getItem("zero-radio-volume"));
  audio.volume=Number.isFinite(savedVolume) && savedVolume>=0 && savedVolume<=1
    ? savedVolume
    : 0.65;
  volume.value=String(audio.volume);

  const setState=(label,isPlaying=false)=>{
    status.textContent=label;
    status.dataset.playing=isPlaying ? "true" : "false";
    icon.textContent=isPlaying ? "❚❚" : "▶";
    play.setAttribute("aria-label",isPlaying ? "Pause rock radio" : "Play rock radio");
  };

  const playRadio=async()=>{
    try{
      await audio.play();
      setState("ON AIR",true);
    }catch{
      setState("CLICK TO PLAY",false);
    }
  };

  const pauseRadio=()=>{
    audio.pause();
    setState("PAUSED",false);
  };

  play.addEventListener("click",()=>{
    if(audio.paused){
      playRadio();
    }else{
      pauseRadio();
    }
  });

  volume.addEventListener("input",()=>{
    audio.volume=Number(volume.value);
    localStorage.setItem("zero-radio-volume",volume.value);
  });

  audio.addEventListener("playing",()=>{
    setState("ON AIR",true);
  });

  audio.addEventListener("pause",()=>{
    if(!audio.ended){
      setState("PAUSED",false);
    }
  });

  audio.addEventListener("waiting",()=>{
    setState("BUFFERING",false);
  });

  audio.addEventListener("stalled",()=>{
    setState("RECONNECTING",false);
  });

  audio.addEventListener("error",()=>{
    if(audio.src===mainStream){
      audio.src=altStream;
      setState("RETRYING",false);
      return;
    }

    setState("OFFLINE",false);
  });

  setState("OFFLINE",false);
});

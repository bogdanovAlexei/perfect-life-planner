const grid24=document.querySelector('.grid');
      const gridDays=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
      const gridLabels=['Lun. 14','Mar. 15','Mer. 16','Jeu. 17','Ven. 18'];
      function extractOcrWords(data){if(Array.isArray(data?.words)&&data.words.length)return data.words;const fromBlocks=(data?.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>(paragraph.lines||[]).flatMap(line=>line.words||[])));if(fromBlocks.length)return fromBlocks;if(typeof data?.tsv==='string')return data.tsv.split(/\r?\n/).slice(1).map(line=>{const cells=line.split('\t');if(cells.length<12||cells[0]!=='5'||!cells.slice(11).join('\t').trim())return null;const left=Number(cells[6]),top=Number(cells[7]),width=Number(cells[8]),height=Number(cells[9]);return {text:cells.slice(11).join('\t').trim(),confidence:Number(cells[10]),bbox:{x0:left,y0:top,x1:left+width,y1:top+height}};}).filter(Boolean);return [];}
      function orderOcrWords(words){const lines=[];[...words].sort((a,b)=>a.y-b.y||a.x-b.x).forEach(word=>{const tolerance=Math.max(5,((word.y1||word.y)-(word.y0||word.y))*.7);let line=lines.find(candidate=>Math.abs(candidate.y-word.y)<=tolerance);if(!line){line={y:word.y,words:[]};lines.push(line);}line.words.push(word);line.y=line.words.reduce((sum,item)=>sum+item.y,0)/line.words.length;});return lines.sort((a,b)=>a.y-b.y).flatMap(line=>line.words.sort((a,b)=>a.x-b.x));}
      function cleanOcrWords(words,minConfidence=30){const output=[];const keepSmall=new Set(['de','du','le','la','et','au','un','une','en','des','les','pro','web','cm','td','tp','tdp','sql']);for(const word of words){if(Number.isFinite(Number(word.confidence))&&Number(word.confidence)<minConfidence)continue;for(const raw of String(word.text||'').split(/\s+/)){let token=raw.replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9_]+$/gu,'');if(!token)continue;if(/^\d+$/.test(token)||/^(.)\1{2,}$/u.test(token))continue;const letters=(token.match(/[A-Za-zÀ-ÿ]/g)||[]).length;const keepCode=/^(?:R\d{1,2}[.]\d{1,2}|T(?:D|P)|TDP|CM|TP)(?:[_-]?\w*)?$/i.test(token);if(letters<3&&!keepCode&&!keepSmall.has(token.toLowerCase()))continue;if(/[æœ]{2,}/i.test(token))continue;const weird=(token.match(/[^A-Za-zÀ-ÿ0-9._'’/()-]/g)||[]).length;if(weird>token.length*.25)continue;if(output.at(-1)?.toLowerCase()===token.toLowerCase())continue;output.push(token);}}return output.join(' ').replace(/\s+([,:;])/g,'$1').trim();}
      function normalizeOcrName(name){let value=String(name||'').replace(/_5(\d{2})\b/g,'_s$1').replace(/\bProbalités\b/gi,'Probabilités').trim();const orphanLink=value.match(/^et\s+(R\d{1,2}[.]\d{1,2})\s+(.+?)\s+((?:TD|TDP|TP|CM)[_-]?\w+)$/i);if(orphanLink){const titleWords=orphanLink[2].split(/\s+/);value=titleWords.length>=2?`${orphanLink[1]} ${titleWords.slice(0,-1).join(' ')} et ${titleWords.at(-1)} ${orphanLink[3]}`:`${orphanLink[1]} ${orphanLink[2]} ${orphanLink[3]}`;}return value.replace(/^(?:de|du|le|la)\s+(?=R\d{1,2}[.]\d{1,2}\b)/i,'').trim();}
      const ocrNameScore=name=>(name==='Cours à vérifier'?0:name.length)+(/\bR\d{1,2}[.]\d{1,2}\b/i.test(name)?50:0)+(/\b(?:TD|TDP|TP|CM)[_-]?\w*/i.test(name)?25:0);
      const demoEvents=[
        {name:'Marche matinale',day:'Lundi',start:'08:00',end:'08:30',type:'Personnel'},
        {name:'Projet Atlas',day:'Lundi',start:'09:00',end:'10:30',type:'Travail'},
        {name:'Projet Atlas',day:'Mardi',start:'09:00',end:'10:30',type:'Travail'},
        {name:'Réunion équipe',day:'Mercredi',start:'09:30',end:'10:15',type:'Travail'},
        {name:'Café avec Ana',day:'Lundi',start:'11:15',end:'11:45',type:'Énergie'},
        {name:'Répondre aux emails',day:'Mardi',start:'11:15',end:'11:45',type:'Travail'},
        {name:'Déjeuner',day:'Mardi',start:'12:30',end:'13:15',type:'Énergie'},
        {name:'Session création',day:'Mardi',start:'14:00',end:'15:00',type:'Travail'}
      ];
      const minuteValue=time=>{const [hour,minute]=String(time).split(':').map(Number);return hour*60+minute;};
      const eventColor=type=>type==='Travail'?'violet':type==='Énergie'?'coral':'mint';
      function renderAgenda(){
        const agenda=document.getElementById('agendaList');
        const today=(customHidden?[]:customEvents).filter(event=>event.day==='Mardi').sort((a,b)=>minuteValue(a.start)-minuteValue(b.start));
        if(!today.length){agenda.innerHTML='<p class="empty-custom">Aucune plage pour aujourd’hui.</p>';return;}
        agenda.innerHTML=today.map((event,index)=>`<div class="agenda-row"><time>${escapeHtml(event.start)}</time><span class="agenda-dot"></span><div class="agenda-name">${escapeHtml(event.name)}<small>${escapeHtml(event.type||'Personnel')} · ${escapeHtml(event.start)}–${escapeHtml(event.end)}</small></div></div>`).join('');
      }
      function renderGridEvents(){
        if(!grid24)return;
        grid24.querySelectorAll('.event').forEach(event=>event.remove());
        const events=(freshMode?[]:demoEvents).concat(customHidden?[]:customEvents);
        events.forEach(event=>{
          const dayIndex=gridDays.indexOf(event.day); if(dayIndex<0)return;
          const start=minuteValue(event.start); const end=Math.max(start+15,minuteValue(event.end));
          const slot=grid24.querySelector(`[data-day-index="${dayIndex}"][data-hour="${Math.floor(start/60)}"]`); if(!slot)return;
          const chip=document.createElement('div'); chip.className=`event ${eventColor(event.type)}`; chip.style.top=`${5+(start%60)/60*68}px`; chip.style.height=`${Math.max(30,(end-start)/60*68-10)}px`;
          chip.dataset.demo=event.id?'false':'true';chip.innerHTML=`${escapeHtml(event.name)}<span>${escapeHtml(event.start)} · ${escapeHtml(event.end)}</span>${event.description?`<span>${escapeHtml(event.description)}</span>`:''}`; if(event.id){chip.dataset.eventId=event.id;chip.title=event.description||'Cliquer pour modifier cette plage';chip.addEventListener('click',eventClick=>{eventClick.stopPropagation();openEventEditor(event.id);});} slot.appendChild(chip);
        });
      }
      let editingEventId=null; let editingFlex='flexible';
      const eventDialog=document.getElementById('eventDialog'); const editEventName=document.getElementById('editEventName'); const editEventDescription=document.getElementById('editEventDescription'); const editEventWhen=document.getElementById('editEventWhen'); const editFlexToggle=document.getElementById('editFlexToggle');
      function paintEditorFlex(){editFlexToggle.textContent=editingFlex==='fixed'?'Fixe · chaque semaine':'Flexible · cette semaine';}
      function openEventEditor(id){const event=customEvents.find(item=>item.id===id);if(!event)return;editingEventId=id;editingFlex=event.flex||'flexible';editEventName.value=event.name||'';editEventDescription.value=event.description||'';editEventWhen.textContent=`${event.day} · ${event.start}–${event.end} · ${event.type||'Personnel'}`;paintEditorFlex();eventDialog.showModal();}
      editFlexToggle.addEventListener('click',()=>{editingFlex=editingFlex==='fixed'?'flexible':'fixed';paintEditorFlex();});
      document.getElementById('closeEvent').addEventListener('click',()=>eventDialog.close());
      document.getElementById('saveEdited').addEventListener('click',()=>{const event=customEvents.find(item=>item.id===editingEventId);if(!event)return;const name=editEventName.value.trim();if(!name){editEventName.focus();return;}event.name=name;event.description=editEventDescription.value.trim();event.flex=editingFlex;saveEvents();renderCustomEvents();renderGridEvents();renderAgenda();eventDialog.close();notice('La plage a été mise à jour.');});
      document.getElementById('deleteEdited').addEventListener('click',()=>{const index=customEvents.findIndex(item=>item.id===editingEventId);if(index<0)return;customEvents.splice(index,1);saveEvents();renderCustomEvents();renderGridEvents();renderAgenda();eventDialog.close();notice('La plage a été supprimée.');});
      function build24HourGrid(){
        if(!grid24)return;
        let html='<div class="day"></div>'+gridLabels.map((label,index)=>`<div class="day${index===1?' today':''}">${label}</div>`).join('');
        for(let hour=0;hour<24;hour++){
          html+=`<div class="time">${String(hour).padStart(2,'0')}:00</div>`;
          gridDays.forEach((day,index)=>{html+=`<div class="slot" data-day-index="${index}" data-hour="${hour}" aria-label="${day} ${String(hour).padStart(2,'0')} heures"></div>`;});
        }
        grid24.innerHTML=html; renderGridEvents();
      }
      build24HourGrid(); renderAgenda(); paintCustomVisibility();
      document.getElementById('customList').addEventListener('click',()=>setTimeout(()=>{renderGridEvents();renderAgenda();},0));
      document.getElementById('addEvent').addEventListener('click',()=>setTimeout(()=>{renderGridEvents();renderAgenda();},0));
      document.getElementById('startFresh').addEventListener('click',()=>setTimeout(renderGridEvents,0));
      const pastedImageInput=document.getElementById('scheduleImage');
      document.addEventListener('paste',event=>{
        const item=[...(event.clipboardData?.items||[])].find(candidate=>candidate.type.startsWith('image/'));
        if(!item)return;
        const file=item.getAsFile(); if(!file)return;
        try{const transfer=new DataTransfer();transfer.items.add(file);pastedImageInput.files=transfer.files;}catch(error){}
        pastedImageInput.dispatchEvent(new Event('change',{bubbles:true})); notice('Capture collée : lecture du planning en cours.');
      });

      // The base renderer stays responsible for layout; this adapter supplies the selected week.
      const baseRenderGridEvents=renderGridEvents;
      function selectedWeekEvents(){const week=window.PLPWeek?.current?.();const key=week?.key;return customEvents.filter(event=>event.flex==='fixed'||event.weekKey===key||(!event.weekKey&&week?.current));}
      function renderCurrentTimeLine(){
        if(!grid24)return;
        let line=grid24.querySelector('.current-time-line');
        if(!line){line=document.createElement('div');line.className='current-time-line';grid24.appendChild(line);}
        const week=window.PLPWeek?.current?.();
        if(!week?.current){line.hidden=true;return;}
        const now=new Date(); const minutes=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
        line.hidden=false; line.style.top=`${42+minutes/60*68}px`; line.innerHTML=`<span class="current-time-label">${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}</span>`;
      }
      function renderGridEventsForSelectedWeek(){
        const previousEvents=customEvents; const previousFresh=freshMode; const week=window.PLPWeek?.current?.();
        customEvents=selectedWeekEvents(); if(!week?.current)freshMode=true;
        try{baseRenderGridEvents();}finally{customEvents=previousEvents;freshMode=previousFresh;}
        renderCurrentTimeLine();
      }
      function renderAgendaForSelectedWeek(){
        const agenda=document.getElementById('agendaList'); if(!agenda)return;
        const day=window.PLPWeek?.getAgendaDayName?.()||'Mardi'; const events=selectedWeekEvents().filter(event=>event.day===day).sort((a,b)=>minuteValue(a.start)-minuteValue(b.start));
        if(!events.length){agenda.innerHTML='<p class="empty-custom">Aucune plage pour cette journée.</p>';return;}
        agenda.innerHTML=events.map(event=>`<div class="agenda-row"><time>${escapeHtml(event.start)}</time><span class="agenda-dot"></span><div class="agenda-name">${escapeHtml(event.name)}<small>${escapeHtml(event.type||'Personnel')} · ${escapeHtml(event.start)}–${escapeHtml(event.end)}</small></div></div>`).join('');
      }
      renderGridEvents=renderGridEventsForSelectedWeek; renderAgenda=renderAgendaForSelectedWeek;
      window.PLPWeek?.subscribe(()=>{renderGridEvents();renderAgenda();});
      window.PLPWeek?.refresh?.();
      renderGridEvents(); renderAgenda();
      setInterval(renderCurrentTimeLine,60000);

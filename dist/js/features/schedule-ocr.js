window.parseSchedulePixels=async function(file,data,worker,Tesseract){
        if(!window.createImageBitmap)return [];
        const bitmap=await createImageBitmap(file); const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
        const words=extractOcrWords(data).filter(word=>word?.text&&word.bbox).map(word=>({text:String(word.text).trim(),confidence:word.confidence,x:(word.bbox.x0+word.bbox.x1)/2,y:(word.bbox.y0+word.bbox.y1)/2,x0:word.bbox.x0,x1:word.bbox.x1,y0:word.bbox.y0,y1:word.bbox.y1})).filter(word=>word.text);
        const width=bitmap.width;const height=bitmap.height;const contentWords=words.filter(word=>word.x0>55);const gridLeft=contentWords.length?Math.min(...contentWords.map(word=>word.x0)):55;const gridRight=contentWords.length?Math.max(...contentWords.map(word=>word.x1)):width-15;
        const dayPatterns=[['Lundi',/^lun/i],['Mardi',/^mar/i],['Mercredi',/^mer/i],['Jeudi',/^jeu/i],['Vendredi',/^ven/i],['Samedi',/^sam/i],['Dimanche',/^dim/i]];const headers=dayPatterns.map(([day,pattern])=>{const found=words.filter(word=>word.y<Math.max(130,height*.18)&&pattern.test(word.text));if(!found.length)return null;return {day,x:found.reduce((sum,word)=>sum+word.x,0)/found.length};}).filter(Boolean);const visibleDays=(headers.length===5?headers:gridDays.map((day,index)=>({day,x:gridLeft+(index+.5)*(gridRight-gridLeft)/5}))).sort((a,b)=>a.x-b.x);const centers=visibleDays.map(item=>item.x);const boundaries=centers.map((center,index)=>[index?((centers[index-1]+center)/2):Math.max(0,center-((centers[1]||center+(gridRight-gridLeft)/5)-center)/2),index<centers.length-1?((center+centers[index+1])/2):Math.min(width,center+((center-(centers[index-1]||center-(gridRight-gridLeft)/5))/2))]);
        const timePattern=/^([01]?\d|2[0-3])\s*[:hH.]\s*([0-5]\d)$/;const timeWords=words.map(word=>{const match=word.text.replace(/[Oo]/g,'0').match(timePattern);return match?{...word,minutes:Number(match[1])*60+Number(match[2])}:null;}).filter(Boolean);const leftLabels=timeWords.filter(word=>word.x<boundaries[0][0]);let yOrigin;let yPerMinute;if(leftLabels.length>=2){const meanM=leftLabels.reduce((sum,word)=>sum+word.minutes,0)/leftLabels.length;const meanY=leftLabels.reduce((sum,word)=>sum+word.y,0)/leftLabels.length;const covariance=leftLabels.reduce((sum,word)=>sum+(word.minutes-meanM)*(word.y-meanY),0);const variance=leftLabels.reduce((sum,word)=>sum+(word.minutes-meanM)**2,0);yPerMinute=variance?covariance/variance:1/60;yOrigin=meanY-yPerMinute*meanM;}else{yPerMinute=height*.86/(17*60);yOrigin=height*.08-yPerMinute*300;}
        const toMinutesFromY=y=>Math.max(0,Math.min(1439,Math.round((y-yOrigin)/yPerMinute/15)*15));const isEventBlue=(r,g,b)=>b>145&&b>r+8&&b>g-4&&r>100;const imagePixels=context.getImageData(0,0,width,height).data;const pixelAt=(x,y)=>{const offset=(Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x)))*4;return [imagePixels[offset],imagePixels[offset+1],imagePixels[offset+2]]};const imported=[];
        visibleDays.forEach((column,columnIndex)=>{
          const [left,right]=boundaries[columnIndex];const rawSegments=[];let segmentStart=null;
          for(let y=35;y<height-5;y++){
            let blueSamples=0;const sampleCount=17;
            for(let sample=1;sample<=sampleCount;sample++){const x=Math.round(left+(right-left)*sample/(sampleCount+1));const [red,green,blue]=pixelAt(x,y);if(isEventBlue(red,green,blue))blueSamples++;}
            const blueRow=blueSamples>=5;
            if(blueRow&&segmentStart===null)segmentStart=y;
            if(!blueRow&&segmentStart!==null){if(y-segmentStart>=3)rawSegments.push({top:segmentStart,bottom:y-1});segmentStart=null;}
          }
          if(segmentStart!==null)rawSegments.push({top:segmentStart,bottom:height-5});
          const segments=[];rawSegments.forEach(segment=>{const previous=segments.at(-1);if(previous&&segment.top-previous.bottom-1<=4)previous.bottom=segment.bottom;else segments.push({...segment});});
          segments.filter(segment=>segment.bottom-segment.top+1>=10).forEach(segment=>{
            let darkSamples=0;for(let y=segment.top;y<=segment.bottom&&darkSamples<6;y+=3){for(let x=Math.round(left)+4;x<Math.round(right)-4&&darkSamples<6;x+=3){const [red,green,blue]=pixelAt(x,y);if(red<110&&green<110&&blue<130)darkSamples++;}}
            if(darkSamples<6)return;
            const segmentWords=orderOcrWords(words.filter(word=>word.x>=left&&word.x<right&&word.y>=segment.top-8&&word.y<=segment.bottom+8&&word.y>height*.05));
            const explicitTimes=timeWords.filter(word=>word.x>=left&&word.x<right&&word.y>=segment.top-8&&word.y<=segment.bottom+8).sort((a,b)=>a.y-b.y);
            const textWords=segmentWords.filter(word=>!timePattern.test(word.text.replace(/[Oo]/g,'0'))&&!/^\d{3,5}$/.test(word.text)&&!/^(?:amphi(?:théâtre)?|salle)$/i.test(word.text));
            const explicitStart=explicitTimes[0];let start=explicitStart?.minutes??Math.max(0,Math.min(1439,Math.round(toMinutesFromY(segment.top)/30)*30));const visualDuration=Math.max(15,Math.round((segment.bottom-segment.top+1)/Math.max(yPerMinute,.01)/15)*15);const pixelEnd=toMinutesFromY(segment.bottom+8);let end=explicitStart?Math.min(1439,start+visualDuration):pixelEnd;
            const laterTime=[...explicitTimes].reverse().find(time=>time.minutes>start);if(laterTime)end=laterTime.minutes;else if(explicitStart&&visualDuration<60&&pixelEnd>start&&pixelEnd-start<=60)end=pixelEnd;
            if(end<=start)end=Math.min(1439,start+Math.max(15,Math.round((segment.bottom-segment.top)/Math.max(yPerMinute,.01)/15)*15));
            const confidentName=cleanOcrWords(textWords,30);const completeName=cleanOcrWords(textWords,0);const name=normalizeOcrName(completeName||confidentName)||'Cours à vérifier';
            imported.push({name:name.slice(0,110),day:column.day,start:toTime(start),end:toTime(end),flex:'fixed',type:'Travail',source:'photo',_crop:{left,right,top:segment.top,bottom:segment.bottom}});
          });
        });
        const weakEvents=imported.filter(event=>event.name==='Cours à vérifier'||event.name.length<5).slice(0,8);
        if(worker&&weakEvents.length){await worker.setParameters({tessedit_pageseg_mode:Tesseract?.PSM?.SINGLE_BLOCK||'6',preserve_interword_spaces:'1'});for(const event of weakEvents){const crop=event._crop;const cropWidth=Math.max(1,Math.round(crop.right-crop.left));const cropHeight=Math.max(1,crop.bottom-crop.top+1);const cropCanvas=document.createElement('canvas');cropCanvas.width=cropWidth*2;cropCanvas.height=cropHeight*2;const cropContext=cropCanvas.getContext('2d');cropContext.filter='grayscale(1) contrast(1.7)';cropContext.drawImage(canvas,crop.left,crop.top,cropWidth,cropHeight,0,0,cropCanvas.width,cropCanvas.height);try{const cropResult=await worker.recognize(cropCanvas,{}, {text:true,blocks:true,tsv:true});const cropWords=extractOcrWords(cropResult.data).filter(word=>!timePattern.test(String(word.text||'').replace(/[Oo]/g,'0'))&&!/^\d{3,5}$/.test(String(word.text||''))&&!/^(?:amphi(?:théâtre)?|salle)$/i.test(String(word.text||'')));const cropName=normalizeOcrName(cleanOcrWords(cropWords.length?cropWords:[{text:cropResult.data.text||'',confidence:100}],0));if(ocrNameScore(cropName)>ocrNameScore(event.name))event.name=cropName.slice(0,110);}catch(error){}}}
        const ordered=imported.sort((a,b)=>gridDays.indexOf(a.day)-gridDays.indexOf(b.day)||minuteValue(a.start)-minuteValue(b.start));const merged=[];ordered.forEach(event=>{const previous=merged.at(-1);const overlaps=previous&&previous.day===event.day&&minuteValue(event.start)<minuteValue(previous.end);const touchesSame=previous&&previous.day===event.day&&minuteValue(event.start)===minuteValue(previous.end)&&previous.name.toLowerCase()===event.name.toLowerCase();if(overlaps||touchesSame){previous.start=minuteValue(event.start)<minuteValue(previous.start)?event.start:previous.start;previous.end=minuteValue(event.end)>minuteValue(previous.end)?event.end:previous.end;if(ocrNameScore(event.name)>ocrNameScore(previous.name))previous.name=event.name;return;}merged.push({...event});});bitmap.close?.();return merged.map(({_crop,...event})=>event);
      };
      window.parseScheduleLayout=function(data){
        const words=extractOcrWords(data).filter(word=>word?.text&&word.bbox).map(word=>({text:String(word.text).trim(),confidence:word.confidence,x:(word.bbox.x0+word.bbox.x1)/2,y:(word.bbox.y0+word.bbox.y1)/2,x0:word.bbox.x0,x1:word.bbox.x1,y0:word.bbox.y0,y1:word.bbox.y1})).filter(word=>word.text);
        if(words.length<8)return [];
        const dayPatterns=[['Lundi',/^lun/i],['Mardi',/^mar/i],['Mercredi',/^mer/i],['Jeudi',/^jeu/i],['Vendredi',/^ven/i],['Samedi',/^sam/i],['Dimanche',/^dim/i]];
        const headers=dayPatterns.map(([day,pattern])=>{const found=words.filter(word=>word.y<Math.max(130,(data.height||900)*.18)&&pattern.test(word.text));if(!found.length)return null;return {day,x:found.reduce((sum,word)=>sum+word.x,0)/found.length};}).filter(Boolean);
        const contentWords=words.filter(word=>word.x0>55); const gridLeft=contentWords.length?Math.min(...contentWords.map(word=>word.x0)):55; const gridRight=contentWords.length?Math.max(...contentWords.map(word=>word.x1)):(data.width||1680)-15;
        const visibleDays=(headers.length===5?headers:gridDays.map((day,index)=>({day,x:gridLeft+(index+.5)*(gridRight-gridLeft)/5}))).sort((a,b)=>a.x-b.x);
        const centers=visibleDays.map(item=>item.x); const boundaries=centers.map((center,index)=>[index?((centers[index-1]+center)/2):center-((centers[1]||center+300)-center)/2,index<centers.length-1?((center+centers[index+1])/2):center+((center-(centers[index-1]||center-300))/2)]);
        const timePattern=/^([01]?\d|2[0-3])\s*[:hH.]\s*([0-5]\d)$/;
        const timeWords=words.map(word=>{const match=word.text.replace(/[Oo]/g,'0').match(timePattern);return match?{...word,minutes:Number(match[1])*60+Number(match[2])}:null;}).filter(Boolean);
        const leftLabels=timeWords.filter(word=>word.x<gridLeft); let yOrigin; let yPerMinute;
        if(leftLabels.length>=2){const meanM=leftLabels.reduce((sum,word)=>sum+word.minutes,0)/leftLabels.length;const meanY=leftLabels.reduce((sum,word)=>sum+word.y,0)/leftLabels.length;const covariance=leftLabels.reduce((sum,word)=>sum+(word.minutes-meanM)*(word.y-meanY),0);const variance=leftLabels.reduce((sum,word)=>sum+(word.minutes-meanM)**2,0);yPerMinute=variance?covariance/variance:1/60;yOrigin=meanY-yPerMinute*meanM;}else{yPerMinute=((data.height||900)*.86)/((22-5)*60);yOrigin=(data.height||900)*.08-yPerMinute*300;}
        const toMinutesFromY=y=>Math.max(0,Math.min(1439,Math.round((y-yOrigin)/yPerMinute/15)*15));
        const eventTimes=timeWords.filter(word=>word.x>=gridLeft).map(word=>({...word,dayIndex:boundaries.findIndex(([min,max])=>word.x>=min&&word.x<max)})).filter(word=>word.dayIndex>=0).sort((a,b)=>a.dayIndex-b.dayIndex||a.y-b.y);
        const imported=[];
        visibleDays.forEach((column,columnIndex)=>{
          const columnTimes=eventTimes.filter(word=>word.dayIndex===columnIndex);
          const anchors=words.filter(word=>word.x>=boundaries[columnIndex][0]&&word.x<boundaries[columnIndex][1]&&/^(?:R\s*)?\d{1,2}[.]\d{1,2}/i.test(word.text)&&word.y>Math.min(...words.map(item=>item.y))+35).sort((a,b)=>a.y-b.y);
          if(anchors.length){
            anchors.forEach((anchor,anchorIndex)=>{
              const previous=columnTimes.filter(time=>time.y<=anchor.y+4).pop();
              const next=columnTimes.find(time=>time.y>anchor.y+8);
              const nextAnchor=anchors[anchorIndex+1];
              const start=previous||{minutes:toMinutesFromY(anchor.y-10),y:anchor.y-10};
              const end=next||{minutes:toMinutesFromY(nextAnchor?nextAnchor.y-8:anchor.y+62),y:nextAnchor?nextAnchor.y-8:anchor.y+62};
              if(end.minutes<=start.minutes)return;
              const top=start.y-14; const bottom=Math.min(end.y+9,nextAnchor?nextAnchor.y-8:end.y+9);
              const textWords=words.filter(word=>word.x>=boundaries[columnIndex][0]&&word.x<boundaries[columnIndex][1]&&word.y>=top&&word.y<=bottom&&!timePattern.test(word.text.replace(/[Oo]/g,'0'))).sort((a,b)=>a.y-b.y||a.x-b.x);
              const name=cleanOcrWords(textWords);
              if(name)imported.push({name:name.slice(0,100),day:column.day,start:toTime(start.minutes),end:toTime(end.minutes),flex:'fixed',type:'Travail'});
            });
            return;
          }
          const pairs=[];
          for(let index=0;index+1<columnTimes.length;index+=2){const start=columnTimes[index];const end=columnTimes[index+1];if(end.minutes<=start.minutes&&end.y<=start.y)continue;pairs.push({start,end});}
          pairs.forEach(pair=>{
            const top=Math.min(pair.start.y,pair.end.y)-8; const bottom=Math.max(pair.start.y,pair.end.y)+8;
            const textWords=words.filter(word=>word.x>=boundaries[columnIndex][0]&&word.x<boundaries[columnIndex][1]&&word.y>=top&&word.y<=bottom&&!timePattern.test(word.text.replace(/[Oo]/g,'0'))&&word.y>Math.min(pair.start.y,pair.end.y)-20).sort((a,b)=>a.y-b.y||a.x-b.x);
            const name=cleanOcrWords(textWords);
            if(name){imported.push({name:name.slice(0,100),day:column.day,start:toTime(pair.start.minutes),end:toTime(pair.end.minutes),flex:'fixed',type:'Travail'});}
          });
        });
        return imported;
      };

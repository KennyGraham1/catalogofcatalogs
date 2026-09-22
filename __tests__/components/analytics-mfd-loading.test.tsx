import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import AnalyticsPage from '@/app/analytics/page';
const catalogues = [{id:'a',name:'Catalogue A',event_count:2},{id:'b',name:'Catalogue B',event_count:3},{id:'c',name:'Catalogue C',event_count:1}];
jest.mock('@/hooks/use-cached-fetch',()=>({useCachedFetch:()=>({data:catalogues,loading:false})}));
jest.mock('next/dynamic',()=>()=>function MockMap({earthquakes}:any){return <div data-testid="map">{earthquakes.length}</div>});
jest.mock('@/hooks/use-seismological-worker',()=>({useSeismologicalAnalyses:()=>({grAnalysis:{data:null},completeness:{data:null},temporalAnalysis:{data:null},momentAnalysis:{data:null}})}));
jest.mock('@/components/charts',()=>({
 ...Object.fromEntries(['MagnitudeDistributionChart','DepthDistributionChart','RegionDistributionChart','CatalogueDistributionChart','MagnitudeDepthScatter','EventTimelineChart','GutenbergRichterChart','CompletenessChart','TemporalSeriesChart','MomentReleaseChart'].map(n=>[n,()=>null])),
 MFDComparisonChart:({catalogues}:any)=><pre data-testid="mfd">{JSON.stringify(catalogues.map((c:any)=>({id:c.catalogueId,total:c.totalEvents,histogramTotal:c.histogram.reduce((sum:number,d:any)=>sum+d.count,0)})))}</pre>
}));
const originalFetch=global.fetch;
const originalResizeObserver=global.ResizeObserver;
beforeEach(()=>{
 global.ResizeObserver=class{observe(){} unobserve(){} disconnect(){}};
 Element.prototype.scrollIntoView=()=>{};
 global.fetch=jest.fn().mockImplementation(async(url:string)=>{
  const id=url.includes('/a/')?'a':url.includes('/b/')?'b':'c';
  const length=id==='a'?2:id==='b'?3:1;
  return {ok:true,json:async()=>({data:Array.from({length},(_,i)=>({id:`${id}-${i}`,time:'2024-01-01',magnitude:3+i/10,depth:10,latitude:-41,longitude:175})),pagination:{hasMore:false,nextCursor:null}})};
 });
});
afterEach(()=>{cleanup();global.fetch=originalFetch;global.ResizeObserver=originalResizeObserver});
async function selectMFD(){
 const tab=screen.getByRole('tab',{name:'MFD'}); fireEvent.mouseDown(tab,{button:0,ctrlKey:false});
 fireEvent.click(await screen.findByLabelText('Catalogue A'));
 fireEvent.click(screen.getByLabelText('Catalogue B'));
}
it('loads only the additional comparison catalogue and reuses it on reselection',async()=>{
 render(<AnalyticsPage/>);
 fireEvent.click(screen.getByRole('combobox'));
 fireEvent.click(await screen.findByRole('option',{name:/Catalogue A/}));
 await waitFor(()=>expect(screen.getByTestId('map')).toHaveTextContent('2'));
 await selectMFD();
 const actual=JSON.parse((await screen.findByTestId('mfd')).textContent!);
 expect(actual).toEqual([{id:'a',total:2,histogramTotal:2},{id:'b',total:3,histogramTotal:3}]);
 expect(global.fetch).toHaveBeenCalledTimes(2);
 expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/a/events');
 expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain('/b/events');
 fireEvent.click(screen.getByLabelText('Catalogue B'));
 fireEvent.click(screen.getByLabelText('Catalogue B'));
 await screen.findByTestId('mfd');
 expect(global.fetch).toHaveBeenCalledTimes(2);
 expect(screen.getByTestId('mfd')).toHaveTextContent('\"total\":3');
});
it('reuses all primary events without fetching any comparison catalogue again',async()=>{
 render(<AnalyticsPage/>);
 fireEvent.click(screen.getByRole('button',{name:/Load All Catalogues/}));
 await waitFor(()=>expect(screen.getByTestId('map')).toHaveTextContent('6'));
 await selectMFD();
 const actual=JSON.parse((await screen.findByTestId('mfd')).textContent!);
 expect(actual).toEqual([{id:'a',total:2,histogramTotal:2},{id:'b',total:3,histogramTotal:3}]);
 expect(global.fetch).toHaveBeenCalledTimes(3);
 expect(global.fetch).toHaveBeenCalledTimes(3);
});

it('withholds incomplete comparisons, exposes loading failures, and retries',async()=>{
 const fetchPages=global.fetch;
 let fail!: (response: unknown)=>void;
 (global.fetch as jest.Mock)=jest.fn().mockImplementation((url:string,...args:any[])=>
   url.includes('/b/') ? new Promise(resolve=>{fail=resolve}) : fetchPages(url,...args));
 render(<AnalyticsPage/>);
 fireEvent.click(screen.getByRole('combobox'));
 fireEvent.click(await screen.findByRole('option',{name:/Catalogue A/}));
 await waitFor(()=>expect(screen.getByTestId('map')).toHaveTextContent('2'));
 await selectMFD();
 expect(screen.getByRole('status')).toHaveTextContent('Loading comparison events');
 expect(screen.queryByTestId('mfd')).not.toBeInTheDocument();
 await act(async()=>fail({ok:false,status:503}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Catalogue B (HTTP 503)');
 expect(screen.queryByTestId('mfd')).not.toBeInTheDocument();
 global.fetch=fetchPages;
 fireEvent.click(screen.getByRole('button',{name:'Retry comparison loading'}));
 expect(await screen.findByTestId('mfd')).toHaveTextContent('"total":3');
});

it('hides the old comparison when replacing its catalogue while the next one loads',async()=>{
 const fetchPages=global.fetch;
 let finish!: (response: unknown)=>void;
 global.fetch=jest.fn().mockImplementation((url:string,options?:RequestInit)=>
   url.includes('/c/') ? new Promise(resolve=>{finish=resolve}) : fetchPages(url,options));
 render(<AnalyticsPage/>);
 fireEvent.click(screen.getByRole('combobox'));
 fireEvent.click(await screen.findByRole('option',{name:/Catalogue A/}));
 await waitFor(()=>expect(screen.getByTestId('map')).toHaveTextContent('2'));
 fireEvent.mouseDown(screen.getByRole('tab',{name:'MFD'}),{button:0,ctrlKey:false});
 fireEvent.click(await screen.findByLabelText('Catalogue B'));
 expect(await screen.findByTestId('mfd')).toHaveTextContent('"id":"b","total":3');
 act(()=>{
   fireEvent.click(screen.getByLabelText('Catalogue B'));
   fireEvent.click(screen.getByLabelText('Catalogue C'));
 });
 expect(screen.queryByTestId('mfd')).not.toBeInTheDocument();
 expect(screen.getByRole('status')).toHaveTextContent('Loading comparison events');
 await act(async()=>finish(await fetchPages('/api/catalogues/c/events')));
 expect(await screen.findByTestId('mfd')).toHaveTextContent('"id":"c","total":1');
 expect(screen.getByTestId('mfd')).not.toHaveTextContent('"id":"b"');
 expect(global.fetch).toHaveBeenCalledTimes(3);
});

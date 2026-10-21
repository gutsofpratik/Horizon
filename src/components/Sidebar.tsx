import {useEffect,useState} from 'react';
import {Users,CalendarClock,Plus,Search,Folder,Shapes,SlidersHorizontal,PanelLeftClose,Settings,Pin,Trash2,ChevronDown,Sparkles,Orbit,Leaf,Zap,Flower,Moon,Sun,Globe} from 'lucide-react';
import {Mark} from './Mark';
import {api} from '../app/api';
import {isDesktopEdition} from '../platform/edition';

const profileIcons:any={spark:Sparkles,planet:Globe,leaf:Leaf,bolt:Zap,flower:Flower,moon:Moon,sun:Sun,orbit:Orbit};
export function Sidebar({view,conversations,selectedId,onView,onNew,onOpen,onSearch,onSettings,onProfiles,onToggle,onPin,onDelete,userName,mode='chat'}:{[key:string]:any}){
 const [profile,setProfile]=useState<any>(null);
 useEffect(()=>{let active=true;api('/profiles/status').then((value:any)=>{if(active)setProfile(value.profile??value.activeProfile);}).catch(()=>{});return()=>{active=false;};},[]);
 const ProfileIcon=profileIcons[profile?.avatar]??null;
 return <aside className="sidebar">
  <div className="sidebar-brand"><button className="icon-button" aria-label="Hide sidebar" onClick={onToggle}><PanelLeftClose size={18}/></button><button className="brand openclaude-brand" aria-label="Horizon" onClick={onNew}>Horizon</button></div>
  <nav>
   <button className="sidebar-search" aria-label="Search conversations" onClick={onSearch}><Search size={14}/><span>Search</span><kbd>Ctrl K</kbd></button>
   <button className="new-chat nav-item" aria-label="New chat" onClick={onNew}><Plus size={18}/><span>New chat</span></button>
   <button className={`nav-item ${view==='projects'?'selected':''}`} onClick={()=>onView('projects')}><Folder size={18}/>Projects</button>
   <button className={`nav-item ${view==='artifacts'?'selected':''}`} onClick={()=>onView('artifacts')}><Shapes size={18}/>Artifacts</button>
   <button className={`nav-item ${view==='skills'?'selected':''}`} onClick={()=>onView('skills')}><SlidersHorizontal size={18}/>Customize</button>
  </nav>
  <div className="recents-label"><span>Recents</span><button className="icon-button" aria-label="Search history" onClick={onSearch}><Search size={16}/></button></div>
  <div className="conversation-list">{conversations.length===0?<div className="history-empty">Your conversations will appear here.</div>:conversations.map((conversation:any)=><div className={`history-row ${selectedId===conversation.id?'active':''}`} key={conversation.id}><button className="history-name" onClick={()=>onOpen(conversation.id)}>{conversation.pinned&&<Pin size={12}/>}<span>{conversation.title||'New conversation'}</span></button><div className="history-actions"><button aria-label={`Pin ${conversation.title}`} onClick={()=>onPin(conversation)}><Pin size={12}/></button><button aria-label={`Delete ${conversation.title}`} onClick={()=>onDelete(conversation)}><Trash2 size={12}/></button></div></div>)}</div>
  <div className="sidebar-footer"><button className="profile" aria-label={isDesktopEdition?'Switch or manage profiles':'Open settings'} onClick={isDesktopEdition?onProfiles:onSettings}><span className="avatar">{ProfileIcon?<ProfileIcon size={16}/>:((profile?.name??userName??'H')[0].toUpperCase())}</span><span className="profile-label"><strong>{profile?.name??userName??'Your profile'}</strong><small>{profile?.loginId?'@'+profile.loginId:'Personal · local'}</small></span>{isDesktopEdition?<ChevronDown size={15}/>:<Settings size={16}/>}</button>{isDesktopEdition&&<button className="profile-settings" aria-label="Open settings" onClick={onSettings}><Settings size={16}/></button>}</div>
 </aside>;
}

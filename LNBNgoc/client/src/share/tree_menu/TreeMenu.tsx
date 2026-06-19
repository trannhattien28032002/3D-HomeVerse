import  React, { useState,useEffect } from "react";
import "src/share/tree_menu/TreeMenu.scss";

interface MenuProps {
    dataTree: Array<{
        id: number;
        ent: number;
        name: string;
    }>;
    onDataSentMenu: (dataFromChildMenu: number) => void;
}

const TreeMenu: React.FC<MenuProps> = ({ dataTree, onDataSentMenu }) => {
    
    const [selectedItemId, setSelectedItemId] = useState(1);


    const handleMenuItemClick = (itemId: number) => {
        setSelectedItemId(itemId);
        onDataSentMenu(itemId);
    };

    useEffect(() => {

    }, [dataTree]);

    return (
        <div className="menu-items">
            <ul className="menu-items-ul">
                {dataTree.map((item) => (
                    <li className={selectedItemId === item.id ? 'selected' : ''} key={item.id}  onClick={() => handleMenuItemClick(item.id)}>
                        <div className="vertical-tiles-li" >
                        </div>
                        <span className="span-tiles-li" >{item.name}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default TreeMenu;
